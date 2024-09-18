const express = require('express');
const path = require('path');
const app = express();

const PORT = 3001;  // Frontend will run on port 3001

// Serve static files from the public folder
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend running on http://localhost:${PORT}`);
});
