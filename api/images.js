import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
let mongoClient = null;
let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  if (!mongoUri) {
    throw new Error('Chưa cấu hình MONGODB_URI biến môi trường');
  }
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  dbInstance = mongoClient.db();
  return dbInstance;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const db = await getDb();
    const collection = db.collection('images');

    // 1. GET: Lấy danh sách ảnh
    if (req.method === 'GET') {
      const images = await collection.find({}).sort({ date: -1 }).toArray();
      return res.status(200).json(images);
    } 
    
    // 2. POST: Thêm ảnh mới
    if (req.method === 'POST') {
      const newImage = req.body;
      if (!newImage || !newImage.id) {
        return res.status(400).json({ error: 'Dữ liệu ảnh không hợp lệ' });
      }
      await collection.insertOne(newImage);
      return res.status(201).json({ success: true, image: newImage });
    }

    // 3. DELETE: Xóa ảnh theo ID
    if (req.method === 'DELETE') {
      // Ưu tiên lấy id từ query do vercel.json rewrite
      let id = req.query.id;
      
      // Nếu không có, parse thủ công từ url
      if (!id) {
        const urlParts = req.url.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart && lastPart !== 'images') {
          id = lastPart.split('?')[0];
        }
      }

      if (id) {
        await collection.deleteOne({ id: id });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Thiếu ID ảnh' });
    }

    return res.status(405).json({ error: 'Phương thức không được hỗ trợ' });
  } catch (error) {
    console.error('Lỗi Vercel Serverless API:', error);
    return res.status(500).json({ error: 'Lỗi kết nối cơ sở dữ liệu: ' + error.message });
  }
}
