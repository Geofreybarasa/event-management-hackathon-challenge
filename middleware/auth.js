const auth = (req, res, next) => {
  // Get token from request headers
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({ 
      message: 'Access denied. No token provided.' 
    });
  }

  if (token !== 'mysecrettoken123') {
    return res.status(403).json({ 
      message: 'Invalid token' 
    });
  }

  next();
};

module.exports = auth;