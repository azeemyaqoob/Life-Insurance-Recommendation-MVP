require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'insurance',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Create tables if they don't exist
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        age INTEGER NOT NULL,
        income INTEGER NOT NULL,
        dependents INTEGER NOT NULL,
        risk_tolerance VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS recommendations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        recommendation_type VARCHAR(50) NOT NULL,
        coverage_amount INTEGER NOT NULL,
        duration_years INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

initializeDatabase();

// Recommendation logic
function generateRecommendation(age, income, dependents, riskTolerance) {
  let recommendationType, coverageAmount, durationYears, explanation;
  
  // Base coverage is typically 10x income
  coverageAmount = Math.round(income * 10 / 50000) * 50000; // Round to nearest $50k
  
  // Adjust based on dependents
  if (dependents > 2) {
    coverageAmount = Math.max(coverageAmount, 500000);
  }
  
  // Determine recommendation type and duration
  if (age < 40) {
    durationYears = 30;
    recommendationType = 'Term Life';
    explanation = 'Term life insurance is ideal for younger individuals as it provides substantial coverage at an affordable price for a long period.';
  } else if (age < 55) {
    durationYears = 20;
    recommendationType = 'Term Life';
    explanation = 'Term life insurance balances coverage and cost for middle-aged individuals.';
  } else {
    durationYears = 15;
    recommendationType = 'Whole Life';
    explanation = 'Whole life insurance provides lifelong coverage and builds cash value, suitable for older individuals.';
  }
  
  // Adjust for risk tolerance
  if (riskTolerance === 'Low') {
    coverageAmount = Math.round(coverageAmount * 0.8);
    explanation += ' We reduced coverage slightly due to your low risk tolerance.';
  } else if (riskTolerance === 'High') {
    coverageAmount = Math.round(coverageAmount * 1.2);
    explanation += ' We increased coverage to match your high risk tolerance.';
  }
  
  return {
    recommendationType,
    coverageAmount,
    durationYears,
    explanation
  };
}

// API endpoint
app.post('/api/recommendation', async (req, res) => {
  const { age, income, dependents, riskTolerance } = req.body;
  
  // Validate inputs
  if (!age || !income || dependents === undefined || !riskTolerance) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (age < 18 || age > 100) {
    return res.status(400).json({ error: 'Age must be between 18 and 100' });
  }
  
  if (!['Low', 'Medium', 'High'].includes(riskTolerance)) {
    return res.status(400).json({ error: 'Invalid risk tolerance value' });
  }
  
  try {
    // Save user data
    const userResult = await pool.query(
      'INSERT INTO users (age, income, dependents, risk_tolerance) VALUES ($1, $2, $3, $4) RETURNING id',
      [age, income, dependents, riskTolerance]
    );
    
    const userId = userResult.rows[0].id;
    
    // Generate recommendation
    const recommendation = generateRecommendation(age, income, dependents, riskTolerance);
    
    // Save recommendation
    await pool.query(
      'INSERT INTO recommendations (user_id, recommendation_type, coverage_amount, duration_years, explanation) VALUES ($1, $2, $3, $4, $5)',
      [userId, recommendation.recommendationType, recommendation.coverageAmount, recommendation.durationYears, recommendation.explanation]
    );
    
    res.json({
      recommendation: `${recommendation.recommendationType} – $${recommendation.coverageAmount.toLocaleString()} for ${recommendation.durationYears} years`,
      explanation: recommendation.explanation
    });
  } catch (err) {
    console.error('Error processing recommendation:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});