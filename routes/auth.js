const express = require('express');
const bcrypt = require('bcryptjs'); // Using bcryptjs consistently
const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // For generating tokens
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY); // Use your secret key
const axios = require('axios');
const router = express.Router();
const app = express();

// Register Route
router.get('/register', (req, res) => {
    res.render('register');
});

// Handle Registration


// Handle Registration
router.post('/register', async (req, res) => {
    const { username, email, password, phoneNumber } = req.body;

    try {
        // Check if user already exists by email, username, or phoneNumber
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }, { phoneNumber }] 
        });

        if (existingUser) {
            return res.status(400).send('User already exists with that email, username, or phone number');
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = new User({ username, email, password: hashedPassword, phoneNumber });
        await newUser.save();

        // Redirect to login page after successful registration
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('Server error');
    }
});



// Login Route
router.get('/login', (req, res) => {
    res.render('login'); // Make sure 'login' corresponds to a valid EJS or HTML file
});

// Handle Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).send('Invalid credentials');
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send('Invalid credentials');
        }

        // Set session user
        req.session.userId = user._id;

        // Redirect to user dashboard after successful login
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Server error');
    }
});


// Forgotten Password Route
router.get('/forgot-password', (req, res) => {
    res.render('forgotten-password'); 
});

// Forgotten Password Route
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        return res.status(404).send('User not found');
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Set token expiry (1 hour)
    const tokenExpiry = Date.now() + 3600000; // 1 hour from now

    // Store the token and expiry in the user's record
    user.resetToken = resetToken;
    user.resetTokenExpiry = tokenExpiry;
    await user.save();

    // Configure nodemailer to send emails
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: 'Password Reset',
        text: `Click the link to reset your password: ${resetLink}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return res.status(500).send('Error sending email');
        }
        res.send('Password reset link sent to your email');
    });
});

// Password reset form and post request
router.get('/reset-password', (req, res) => {
    const token = req.query.token;
    res.render('reset-password', { token });
});

router.post('/reset-password', async (req, res) => {
    const { password, confirmPassword, token } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).send('Passwords do not match');
    }

    const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) {
        return res.status(400).send('Invalid or expired token');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.send('Password has been successfully reset.');
});

// Dashboard Route
router.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
        return res.redirect('/login');
    }

    res.render('dashboard', { user });
});

// Logout Route
router.get('/logout', (req, res) => {
    // Destroy the session and redirect to home page
    req.session.destroy(err => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/'); // Redirect to home page
    });
});


// Verify payment using Paystack
router.get('/verify-payment', async (req, res) => {
    const { reference } = req.query;

    try {
        const payment = await paystack.transaction.verify(reference);
        
        if (payment.status === 'success') {
            // Payment successful
            const amountPaid = payment.data.amount / 100; // Convert from kobo to Naira
            const email = payment.data.customer.email; // Extract user email

            // Find the user by their email (or another unique identifier) and update their balance
            const user = await User.findOne({ email });

            if (user) {
                // Update the user's balance
                user.balance = (user.balance || 0) + amountPaid; // Increment the balance
                await user.save();
                
                // Redirect to the dashboard with a success message
                req.flash('success', 'Your balance has been updated successfully.');
                return res.redirect('/dashboard'); 
            } else {
                // User not found, redirect with error message
                req.flash('error', 'User not found. Please contact support.');
                return res.redirect('/dashboard');
            }
        } else {
            // Payment verification failed
            req.flash('error', 'Payment verification failed. Please try again.');
            return res.redirect('/dashboard');
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        req.flash('error', 'An error occurred during payment verification. Please try again.');
        return res.redirect('/dashboard');
    }
});






module.exports = router;
