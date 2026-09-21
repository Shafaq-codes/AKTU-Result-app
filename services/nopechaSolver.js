const axios = require('axios');

/**
 * NopeCHA Automated Captcha Solver Helper
 */
class NopechaSolver {
  constructor() {
    this.apiKey = process.env.NOPECHA_KEY || '';
  }

  isAvailable() {
    return !!this.apiKey;
  }

  async solveImageCaptcha(base64Image) {
    if (!this.apiKey) {
      throw new Error('NOPECHA_KEY is not configured in .env');
    }

    try {
      const response = await axios.post(
        'https://api.nopecha.com/',
        {
          type: 'textcaptcha',
          image_urls: [base64Image],
          key: this.apiKey
        },
        { timeout: 10000 }
      );

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      throw new Error('No captcha solution returned');
    } catch (err) {
      console.error('[NopechaSolver] Error solving captcha:', err.message);
      throw err;
    }
  }
}

module.exports = new NopechaSolver();
