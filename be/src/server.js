require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.set('trust proxy', 1);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Route kiểm tra sức khỏe hệ thống
app.get('/api/health', (req, res) => {
    return res.json({
        success: true,
        message: 'API Invoices is running'
    });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/products', require('./routes/products'));
app.use('/api/aliases', require('./routes/productAliases'));
app.use('/api/stockTransactions', require('./routes/stockTransactions'));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});