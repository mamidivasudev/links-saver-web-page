const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));
// Serve static files from the current directory so MyLinks.html can be accessed directly
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'saved_links.json');

// Get links
app.get('/api/links', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) return res.json({});
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(data || '{}'));
  } catch (err) {
    // Corrupt/unreadable file: report an error instead of crashing, so the page keeps its local copy
    console.error('Could not read', DATA_FILE, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save links
app.post('/api/links', (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, error: 'Invalid data' });
    }
    // Write to a temp file, then rename, so a crash mid-write can't leave a half-written saved_links.json
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Server is running at http://localhost:${port}/MyLinks.html`);
});
