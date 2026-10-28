require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves HTML/CSS static files

// API Route to fetch messages from Supabase
app.get('/api/messages', async (req, res) => {
  const { data, error } = await supabase.from('messages').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// API Route to save a new message into Supabase
app.post('/api/messages', async (req, res) => {
  const { content } = req.body;
  const { data, error } = await supabase.from('messages').insert([{ content }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Success', data });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});