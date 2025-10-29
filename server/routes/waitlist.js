import express from 'express';
import pool from '../db';
const router = express.Router();
// POST /api/waitlist - Add email to waitlist
router.post('/', async (req, res) => {
    console.log('📧 Waitlist signup attempt');
    try {
        const { email } = req.body;
        if (!email) {
            console.log('❌ Missing email');
            return res.status(400).json({ message: 'Email is required' });
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log('❌ Invalid email format:', email);
            return res.status(400).json({ message: 'Invalid email format' });
        }
        // Check if email already exists
        const existingEmail = await pool.query('SELECT id FROM waitlist WHERE email = $1', [email.toLowerCase()]);
        if (existingEmail.rows.length > 0) {
            console.log('⚠️ Email already on waitlist:', email);
            return res.status(200).json({
                message: 'You are already on the waitlist!',
                alreadyExists: true
            });
        }
        // Insert into waitlist
        const result = await pool.query('INSERT INTO waitlist (email, created_at) VALUES ($1, NOW()) RETURNING id, email, created_at', [email.toLowerCase()]);
        console.log('✅ Added to waitlist:', email);
        res.status(201).json({
            message: 'Successfully joined the waitlist!',
            data: {
                id: result.rows[0].id,
                email: result.rows[0].email,
                created_at: result.rows[0].created_at
            }
        });
    }
    catch (error) {
        console.error('❌ Waitlist signup error:', error);
        res.status(500).json({ message: 'Failed to join waitlist. Please try again.' });
    }
});
// GET /api/waitlist/count - Get total waitlist count (optional admin feature)
router.get('/count', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM waitlist');
        const count = parseInt(result.rows[0].count);
        res.json({ count });
    }
    catch (error) {
        console.error('❌ Error fetching waitlist count:', error);
        res.status(500).json({ message: 'Failed to fetch count' });
    }
});
export default router;
