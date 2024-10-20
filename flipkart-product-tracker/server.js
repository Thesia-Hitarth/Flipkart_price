const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/flipkartProducts', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Define Schema and Model for Product
const productSchema = new mongoose.Schema({
  url: String,
  title: String,
  description: String,
  currentPrice: Number,
  reviews: String,
  totalPurchases: String,
  priceHistory: [{ price: Number, date: Date }],
});

const Product = mongoose.model('Product', productSchema);

// Helper function to scrape product details
const scrapeFlipkartProduct = async (url) => {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const title = $('span.B_NuCI').text();
    const description = $('div._1mXcCf').text();
    const price = parseFloat($('div._30jeq3._16Jk6d').text().replace('₹', '').replace(',', ''));
    const reviews = $('span._2_R_DZ').text();
    const totalPurchases = $('span._2_R_DZ').text(); // Same as reviews in Flipkart

    return { title, description, price, reviews, totalPurchases };
  } catch (err) {
    console.error(err);
    return null;
  }
};

// API Endpoint to fetch product details and store in DB
app.post('/api/products', async (req, res) => {
  const { url } = req.body;
  const productData = await scrapeFlipkartProduct(url);

  if (!productData) {
    return res.status(500).json({ message: 'Error fetching product details' });
  }

  const { title, description, price, reviews, totalPurchases } = productData;

  const product = new Product({
    url,
    title,
    description,
    currentPrice: price,
    reviews,
    totalPurchases,
    priceHistory: [{ price, date: new Date() }]
  });

  await product.save();
  res.status(201).json(product);
});

// API Endpoint to recheck the price of a product
app.post('/api/products/:id/recheck', async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const updatedProductData = await scrapeFlipkartProduct(product.url);
  if (!updatedProductData) {
    return res.status(500).json({ message: 'Error fetching product details' });
  }

  const newPrice = updatedProductData.price;
  product.priceHistory.push({ price: newPrice, date: new Date() });
  product.currentPrice = newPrice;

  await product.save();
  res.status(200).json(product);
});

// API Endpoint to list all products
app.get('/api/products', async (req, res) => {
  const products = await Product.find();
  res.status(200).json(products);
});

// API Endpoint to search/filter products
app.get('/api/products/search', async (req, res) => {
  const { title, minPrice, maxPrice } = req.query;
  let filter = {};

  if (title) {
    filter.title = { $regex: title, $options: 'i' };
  }

  if (minPrice && maxPrice) {
    filter.currentPrice = { $gte: parseFloat(minPrice), $lte: parseFloat(maxPrice) };
  }

  const products = await Product.find(filter);
  res.status(200).json(products);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
