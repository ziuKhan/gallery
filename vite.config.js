import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';

// Load biến môi trường từ file .env thủ công
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key && val) {
        process.env[key] = val;
      }
    }
  });
}

const mongoUri = process.env.MONGODB_URI;
let mongoClient = null;
let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  if (!mongoUri) {
    throw new Error('Chưa cấu hình MONGODB_URI trong file .env');
  }
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  dbInstance = mongoClient.db(); // Lấy db mặc định từ connection string (ví dụ "gallery")
  return dbInstance;
}

const apiPlugin = () => ({
  name: 'api-plugin',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url === '/api/images' || req.url.startsWith('/api/images/')) {
        res.setHeader('Content-Type', 'application/json');

        try {
          const db = await getDb();
          const collection = db.collection('images');

          if (req.method === 'GET') {
            const images = await collection.find({}).sort({ date: -1 }).toArray();
            res.statusCode = 200;
            res.end(JSON.stringify(images));
          } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                const newImage = JSON.parse(body);
                await collection.insertOne(newImage);
                res.statusCode = 201;
                res.end(JSON.stringify({ success: true, image: newImage }));
              } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Dữ liệu ảnh không hợp lệ' }));
              }
            });
          } else if (req.method === 'DELETE') {
            const urlParts = req.url.split('/');
            const id = urlParts[urlParts.length - 1];
            if (id && id !== 'images') {
              await collection.deleteOne({ id: id });
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Thiếu ID ảnh' }));
            }
          }
        } catch (error) {
          console.error('Lỗi API MongoDB:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Lỗi kết nối cơ sở dữ liệu: ' + error.message }));
        }
      } else {
        next();
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiPlugin()
  ]
});
