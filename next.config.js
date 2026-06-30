const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['arabic-persian-reshaper', 'pdfkit'],
  },

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ]
      }
    ]
  },
  webpack: (config, { isServer, webpack }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        'canvas',
        'arabic-persian-reshaper',
      ];
      
      // Copy PDFKit font files to the server build
      // The path structure in Next.js builds can vary, so we copy to multiple possible locations
      const pdfkitDataPath = path.resolve(__dirname, 'node_modules/pdfkit/js/data');
      
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: pdfkitDataPath,
              to: path.resolve(__dirname, '.next/server/vendor-chunks/data'),
              noErrorOnMissing: true,
            },
            {
              from: pdfkitDataPath,
              to: path.resolve(__dirname, '.next/server/chunks/data'),
              noErrorOnMissing: true,
            },
            {
              from: path.resolve(__dirname, 'assets/fonts'),
              to: path.resolve(__dirname, '.next/server/assets/fonts'),
              noErrorOnMissing: true,
            },
          ],
        })
      );
    }
    return config;
  },
}

module.exports = nextConfig
