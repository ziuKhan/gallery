import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UploadCloud, Calendar, Folder, Image as ImageIcon, X, ArrowLeft, Trash2, Download, Loader2, Settings, LogOut, Lock, Check } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Cloudinary } from '@cloudinary/url-gen';
import { auto } from '@cloudinary/url-gen/actions/resize';
import { autoGravity } from '@cloudinary/url-gen/qualifiers/gravity';
import { AdvancedImage } from '@cloudinary/react';

// ============================================================================
// 1. KHỞI TẠO FIREBASE (CẤU HÌNH ĐÁM MÂY)
// LƯU Ý KHI ĐƯA LÊN VERCEL:
// Bạn cần thay thế `typeof __firebase_config...` bằng cục cấu hình { apiKey: "...", ... }
// lấy từ trang chủ Firebase Console của bạn.
// ============================================================================
let app, auth, db, appId;
try {
  let firebaseConfig = {};
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  } else {
    const savedFirebase = localStorage.getItem('firebase_config');
    if (savedFirebase) {
      try {
        firebaseConfig = JSON.parse(savedFirebase);
      } catch (e) {
        console.error("Lỗi parse cấu hình Firebase từ localStorage:", e);
      }
    }
  }

  if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'my-gallery-app';
  }
} catch (error) {
  console.error("Lỗi khởi tạo Firebase:", error);
}

// ============================================================================
// HÀM NÉN ẢNH (Vì Firestore giới hạn dung lượng 1MB/document)
// ============================================================================
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Giới hạn chiều rộng để dung lượng nhẹ đi
        let scaleSize = 1;

        if (img.width > MAX_WIDTH) {
          scaleSize = MAX_WIDTH / img.width;
        }

        canvas.width = img.width * scaleSize;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Nén thành định dạng JPEG với chất lượng 70%
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  });
};

const cleanFileName = (name) => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9.-]/g, "_");
};

export default function App() {
  const [user, setUser] = useState(null);
  const [images, setImages] = useState([]);
  const [view, setView] = useState('timeline');
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [currentAlbumInput, setCurrentAlbumInput] = useState('Album mặc định');

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const fileInputRef = useRef(null);

  // Trạng thái đăng nhập
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('is_logged_in') === 'true');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (usernameInput.trim() === 'midaika' && passwordInput === 'mimi90') {
      setIsLoggedIn(true);
      localStorage.setItem('is_logged_in', 'true');
      setLoginError('');
    } else {
      setLoginError('Tài khoản hoặc mật khẩu không chính xác!');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('is_logged_in');
    setUsernameInput('');
    setPasswordInput('');
    setSelectedIds([]); // Reset selection khi logout
  };

  // Quản lý các ảnh được chọn để thao tác hàng loạt (Bulk Actions)
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelectImage = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  // Cấu hình Cloudinary
  const [cloudName, setCloudName] = useState(() => localStorage.getItem('cld_cloud_name') || 'vlbptkxp');
  const [uploadPreset, setUploadPreset] = useState(() => localStorage.getItem('cld_upload_preset') || 'mimi90');
  const [showSettings, setShowSettings] = useState(false);

  // Cấu hình Firebase dạng JSON string
  const [tempFirebaseConfig, setTempFirebaseConfig] = useState(() => localStorage.getItem('firebase_config') || '');

  // Dữ liệu tạm thời cho Modal Cài đặt
  const [tempCloudName, setTempCloudName] = useState(cloudName);
  const [tempUploadPreset, setTempUploadPreset] = useState(uploadPreset);

  // ============================================================================
  // 2. XÁC THỰC NGƯỜI DÙNG TỰ ĐỘNG
  // ============================================================================
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Lỗi đăng nhập:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // ============================================================================
  // 3. TẢI DỮ LIỆU TỪ FIREBASE (Lắng nghe real-time)
  // ============================================================================
  useEffect(() => {
    if (!user || !db) return;

    // Đường dẫn chuẩn để lưu trữ dữ liệu cá nhân
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'images');

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedImages = [];
        snapshot.forEach((doc) => {
          fetchedImages.push(doc.data());
        });
        setImages(fetchedImages);
      },
      (error) => {
        console.error("Lỗi khi tải ảnh từ Cloud:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Dự phòng: Tải dữ liệu từ local API (ghi vào file data.json) nếu không sử dụng Firebase
  useEffect(() => {
    if (!db || !user) {
      const fetchLocalImages = async () => {
        try {
          const res = await fetch('/api/images');
          if (res.ok) {
            const data = await res.json();
            setImages(data);
          }
        } catch (e) {
          console.error("Lỗi tải ảnh từ local api:", e);
        }
      };
      fetchLocalImages();
    }
  }, [user]);

  const uploadToCloudinary = async (file, currentCloudName, currentUploadPreset) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', currentUploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${currentCloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Lỗi tải ảnh lên Cloudinary');
    }

    return await response.json();
  };

  const processFiles = async (files) => {
    if (!cloudName || !uploadPreset) {
      alert("Vui lòng cấu hình Cloud Name và Upload Preset trong phần Cài đặt trước khi tải ảnh lên!");
      setShowSettings(true);
      return;
    }

    setIsUploading(true);
    const fileArray = Array.from(files).filter(file => file.type.startsWith('image/'));

    for (const file of fileArray) {
      try {
        // Chuẩn hóa tên file thành không dấu (ASCII) để tránh lỗi header multipart của trình duyệt
        const asciiName = cleanFileName(file.name);
        const safeFile = new File([file], asciiName, { type: file.type });

        // Tải ảnh trực tiếp lên Cloudinary
        const uploadResult = await uploadToCloudinary(safeFile, cloudName, uploadPreset);
        const newId = Math.random().toString(36).substr(2, 9);
        const newImage = {
          id: newId,
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          cloudName: cloudName,
          name: file.name,
          date: Date.now(), // Lưu dạng số để dễ sắp xếp
          album: currentAlbumInput.trim() || 'Album mặc định'
        };

        if (!user || !db) {
          // Lưu cục bộ (Local Mode) bằng cách gọi API POST ghi vào file data.json
          const apiRes = await fetch('/api/images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newImage)
          });
          if (apiRes.ok) {
            setImages(prev => [newImage, ...prev]);
          } else {
            throw new Error('Không thể lưu ảnh vào file data.json cục bộ');
          }
        } else {
          // Tạo file trên Cloud Firestore
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'images', newId);
          await setDoc(docRef, newImage);
        }
      } catch (error) {
        console.error("Lỗi khi lưu ảnh:", error);
        alert(`Lỗi khi tải ảnh "${file.name}": ${error.message}`);
      }
    }

    setIsUploading(false);
  };

  const handleFileSelect = (e) => {
    processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) processFiles(e.dataTransfer.files);
  };

  // ============================================================================
  // 5. XÓA ẢNH TRÊN ĐÁM MÂY
  // ============================================================================
  const deleteImage = async (id, silent = false) => {
    if (!silent) {
      const ok = confirm("Bạn có chắc chắn muốn xóa ảnh này không?");
      if (!ok) return false;
    }

    if (!user || !db) {
      // Chế độ Offline/Local: Gọi API DELETE để xóa ảnh khỏi file data.json cục bộ
      try {
        const apiRes = await fetch(`/api/images/${id}`, { method: 'DELETE' });
        if (apiRes.ok) {
          setImages(prev => prev.filter(img => img.id !== id));
          if (fullscreenImage?.id === id) setFullscreenImage(null);
          return true;
        } else {
          alert('Không thể xóa ảnh khỏi file data.json cục bộ');
          return false;
        }
      } catch (e) {
        console.error("Lỗi khi xóa ảnh offline:", e);
        return false;
      }
    }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'images', id));
      if (fullscreenImage?.id === id) setFullscreenImage(null);
      return true;
    } catch (error) {
      console.error("Lỗi khi xóa ảnh:", error);
      return false;
    }
  };

  const deleteSelectedImages = async () => {
    if (selectedIds.length === 0) return;
    const ok = confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} ảnh đã chọn không?`);
    if (!ok) return;

    setIsUploading(true);
    for (const id of selectedIds) {
      await deleteImage(id, true);
    }
    setIsUploading(false);
    setSelectedIds([]);
  };

  const downloadSelectedImages = () => {
    if (selectedIds.length === 0) return;
    const selectedImages = images.filter(img => selectedIds.includes(img.id));

    selectedImages.forEach((img, index) => {
      setTimeout(() => {
        let downloadUrl = img.url;
        if (img.publicId && img.cloudName) {
          downloadUrl = img.url.replace('/upload/', '/upload/fl_attachment/');
        }
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = img.name || `image_${index}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 250); // Giãn cách 250ms để trình duyệt tải tuần tự
    });
  };

  // Nhóm ảnh theo ngày cho Timeline
  const groupedByDate = useMemo(() => {
    const groups = {};
    // Sắp xếp ảnh mới nhất lên đầu dựa vào Timestamp
    const sortedImages = [...images].sort((a, b) => b.date - a.date);

    sortedImages.forEach(img => {
      const dateObj = new Date(img.date);
      const dateStr = dateObj.toLocaleDateString('vi-VN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(img);
    });
    return groups;
  }, [images]);

  // Nhóm ảnh theo Album
  const groupedByAlbum = useMemo(() => {
    const groups = {};
    images.forEach(img => {
      if (!groups[img.album]) groups[img.album] = [];
      groups[img.album].push(img);
    });
    return groups;
  }, [images]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800 font-sans p-4 relative overflow-hidden">
        {/* Background họa tiết chấm lưới tinh tế */}
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-70" />

        <div className="w-full max-w-md bg-white border border-slate-100 rounded-3xl p-10 shadow-[0_20px_50px_rgba(15,23,42,0.04)] relative z-10 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-blue-50 border border-blue-100/50 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-blue-600 text-center">
              ĐĂNG NHẬP HỆ THỐNG
            </h2>
            <p className="text-xs text-slate-400 mt-2 text-center max-w-[280px]">
              Nhập tài khoản cố định của bạn để truy cập Kho Ảnh Của Tôi
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {loginError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-xl text-xs text-center font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                {loginError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Tài khoản</label>
              <input
                type="text"
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Nhập tài khoản..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 text-slate-800 transition-all font-medium placeholder:text-slate-300 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Mật khẩu</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 text-slate-800 transition-all font-medium placeholder:text-slate-300 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:shadow-blue-500/10 transition-all cursor-pointer text-sm font-sans tracking-wide mt-2"
            >
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-8 h-8 text-blue-600" />
            <h1
              className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
              Kho Ảnh Của Tôi {user && db ? (
                <span className="text-sm font-normal text-green-600 ml-2">(Firebase Sync)</span>
              ) : (
                <span className="text-sm font-normal text-amber-500 ml-2">(Chế độ Cục bộ)</span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button onClick={() => { setView('timeline'); setSelectedAlbum(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${view === 'timeline' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <Calendar className="w-4 h-4" /> Dòng thời gian
              </button>
              <button onClick={() => { setView('album'); setSelectedAlbum(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${view === 'album' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <Folder className="w-4 h-4" /> Album
              </button>
            </div>

            <button
              onClick={() => {
                setTempCloudName(cloudName);
                setTempUploadPreset(uploadPreset);
                setShowSettings(true);
              }}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 shadow-sm bg-white"
              title="Cài đặt Cloudinary"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200 shadow-sm bg-white"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Khu vực Upload */}
        <div className="mb-12 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Gắn thẻ Album cho đợt tải lên này:</label>
            <input type="text" value={currentAlbumInput} onChange={(e) => setCurrentAlbumInput(e.target.value)}
              placeholder="VD: Du lịch Đà Lạt 2026..."
              disabled={isUploading}
              className="w-full sm:w-1/2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
            />
          </div>

          <div className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
            } ${isUploading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
            }`}
            onDragOver={isUploading ? undefined : onDragOver}
            onDragLeave={isUploading ? undefined : onDragLeave}
            onDrop={isUploading ? undefined : onDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef}
              onChange={handleFileSelect} disabled={isUploading} />
            <div className="flex flex-col items-center justify-center pointer-events-none min-h-[100px]">
              {isUploading ? (
                <>
                  <Loader2 className="w-12 h-12 mb-3 text-blue-500 animate-spin" />
                  <p className="text-lg font-medium text-blue-600">Đang nén và lưu lên Cloud...</p>
                </>
              ) : (
                <>
                  <UploadCloud className={`w-12 h-12 mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                  <p className="text-lg font-medium text-gray-700">
                    {isDragging ? 'Thả ảnh vào đây...' : 'Kéo thả ảnh vào đây hoặc Click để chọn'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Ảnh sẽ được lưu tự động lên hệ thống</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Nội dung chính */}
        {images.length === 0 ? (
          <div className="text-center py-20">
            <ImageIcon className="w-20 h-20 text-gray-200 mx-auto mb-4" />
            <p className="text-xl text-gray-500">Bạn chưa có bức ảnh nào trên Cloud.</p>
          </div>
        ) : (
          <>
            {view === 'timeline' && (
              <div className="space-y-12 ml-2 md:ml-6 border-l-2 border-blue-100 pl-6 md:pl-10 relative">
                {Object.keys(groupedByDate).map(dateStr => (
                  <div key={dateStr} className="relative">
                    <div
                      className="absolute -left-[31px] md:-left-[47px] top-1 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-white shadow-sm" />
                    <h2
                      className="text-xl font-bold text-gray-800 mb-6 capitalize sticky top-[80px] bg-gray-50 py-2 z-0">
                      {dateStr}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                      {groupedByDate[dateStr].map(img => (
                        <ImageCard
                          key={img.id}
                          image={img}
                          isSelected={selectedIds.includes(img.id)}
                          onToggleSelect={toggleSelectImage}
                          isSelectMode={selectedIds.length > 0}
                          onView={() => setFullscreenImage(img)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === 'album' && (
              <div>
                {!selectedAlbum ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.keys(groupedByAlbum).map(albumName => {
                      const albumImages = groupedByAlbum[albumName];
                      const coverImage = albumImages[0];
                      return (
                        <div key={albumName} onClick={() => setSelectedAlbum(albumName)}
                          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                        >
                          <div className="h-48 overflow-hidden relative">
                            <img src={coverImage.url} alt={albumName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                            <div
                              className="absolute bottom-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-sm font-medium backdrop-blur-sm">
                              {albumImages.length} ảnh
                            </div>
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-bold text-gray-800 line-clamp-1">{albumName}</h3>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setSelectedAlbum(null)}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-6 font-medium transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" /> Quay lại danh sách Album
                    </button>
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">{selectedAlbum}</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                      {groupedByAlbum[selectedAlbum].map(img => (
                        <ImageCard
                          key={img.id}
                          image={img}
                          isSelected={selectedIds.includes(img.id)}
                          onToggleSelect={toggleSelectImage}
                          isSelectMode={selectedIds.length > 0}
                          onView={() => setFullscreenImage(img)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Trình xem ảnh phóng to (Lightbox) */}
      {fullscreenImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onClick={() => setFullscreenImage(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-4 z-50">
            <button onClick={async (e) => {
              e.stopPropagation();
              const deleted = await deleteImage(fullscreenImage.id, false);
              if (deleted) {
                setFullscreenImage(null);
              }
            }}
              className="p-3 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-colors backdrop-blur-md"
              title="Xóa ảnh này"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={(e) => {
              e.stopPropagation();
              let downloadUrl = fullscreenImage.url;
              // Nếu là ảnh từ Cloudinary, chèn fl_attachment để tải về file chất lượng gốc 100%
              if (fullscreenImage.publicId && fullscreenImage.cloudName) {
                downloadUrl = fullscreenImage.url.replace('/upload/', '/upload/fl_attachment/');
              }

              const a = document.createElement('a');
              a.href = downloadUrl;
              a.download = fullscreenImage.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
              title="Tải ảnh về"
            >
              <Download className="w-5 h-5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Hiển thị ảnh gốc sắc nét 100% không qua nén chất lượng của SDK khi xem phóng to */}
          <img src={fullscreenImage.url} alt={fullscreenImage.name}
            className="max-w-full max-h-[90vh] object-contain select-none cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Thanh công cụ thao tác hàng loạt (Bulk Action Bar) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/90 backdrop-blur-md border border-gray-200/80 px-6 py-4 rounded-2xl shadow-xl flex items-center justify-between gap-6 max-w-lg w-[90%] animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">
              {selectedIds.length}
            </div>
            <span className="text-sm font-semibold text-gray-700">đang chọn</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadSelectedImages}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors animate-pulse"
              style={{ animationDuration: '3s' }}
              title="Tải về các ảnh đã chọn"
            >
              <Download className="w-4 h-4" /> Tải về
            </button>
            <button
              onClick={deleteSelectedImages}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors"
              title="Xóa các ảnh đã chọn"
            >
              <Trash2 className="w-4 h-4" /> Xóa
            </button>
            <button
              onClick={clearSelection}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Hủy chọn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cấu hình Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-600 animate-spin" style={{ animationDuration: '3s' }} /> Cấu hình Hệ thống
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cloud Name (Cloudinary):
                </label>
                <input
                  type="text"
                  value={tempCloudName}
                  onChange={(e) => setTempCloudName(e.target.value)}
                  placeholder="Nhập Cloud Name của bạn..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Preset (Unsigned):
                </label>
                <input
                  type="text"
                  value={tempUploadPreset}
                  onChange={(e) => setTempUploadPreset(e.target.value)}
                  placeholder="Nhập Unsigned Upload Preset..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lưu ý: Preset phải ở chế độ <strong>Unsigned</strong> trong Cloudinary.
                </p>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firebase Config (JSON - Tùy chọn):
                </label>
                <textarea
                  value={tempFirebaseConfig}
                  onChange={(e) => setTempFirebaseConfig(e.target.value)}
                  placeholder='{"apiKey": "...", "authDomain": "...", ...}'
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Nhập cấu hình Firebase JSON của bạn để lưu dữ liệu lên đám mây. Để trống nếu bạn muốn chạy ở <strong>Chế độ Cục bộ (Local Mode)</strong>.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  let parsedConfig = null;
                  const trimmedConfig = tempFirebaseConfig.trim();
                  if (trimmedConfig) {
                    try {
                      parsedConfig = JSON.parse(trimmedConfig);
                    } catch (e) {
                      alert("Cấu hình Firebase JSON không hợp lệ! Vui lòng kiểm tra lại cú pháp.");
                      return;
                    }
                  }

                  const originalConfig = localStorage.getItem('firebase_config') || '';
                  const newConfigStr = parsedConfig ? JSON.stringify(parsedConfig) : '';

                  localStorage.setItem('cld_cloud_name', tempCloudName.trim());
                  localStorage.setItem('cld_upload_preset', tempUploadPreset.trim());

                  if (parsedConfig) {
                    localStorage.setItem('firebase_config', newConfigStr);
                  } else {
                    localStorage.removeItem('firebase_config');
                  }

                  setCloudName(tempCloudName.trim());
                  setUploadPreset(tempUploadPreset.trim());
                  setShowSettings(false);

                  if (originalConfig !== newConfigStr) {
                    alert("Cấu hình Firebase đã thay đổi. Trang sẽ tải lại để áp dụng kết nối mới!");
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Lưu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component Thẻ Ảnh
function ImageCard({ image, isSelected, onToggleSelect, isSelectMode, onView }) {
  const isCloudinary = !!(image.publicId && image.cloudName);

  let renderImage;
  if (isCloudinary) {
    const cld = new Cloudinary({
      cloud: { cloudName: image.cloudName }
    });
    const cldImg = cld.image(image.publicId)
      .format('auto')
      .quality('auto')
      .resize(auto().gravity(autoGravity()).width(400).height(400));

    renderImage = (
      <AdvancedImage
        cldImg={cldImg}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
      />
    );
  } else {
    renderImage = (
      <img src={image.url} alt={image.name}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
    );
  }

  return (
    <div
      className={`group relative aspect-square bg-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer border-2 ${isSelected
        ? 'border-blue-600 shadow-blue-500/20 scale-[0.98]'
        : 'border-transparent'
        }`}
      onClick={() => {
        if (isSelectMode) {
          onToggleSelect(image.id);
        } else {
          onView();
        }
      }}
    >
      {renderImage}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Nút tròn chọn ảnh (ở góc trên bên trái) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(image.id);
        }}
        className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-300 ${isSelected
          ? 'bg-blue-600 border-blue-600 text-white scale-110 shadow-md'
          : 'bg-black/20 border-white/50 text-transparent hover:bg-black/40 group-hover:opacity-100 opacity-0'
          }`}
        title={isSelected ? "Bỏ chọn" : "Chọn ảnh này"}
      >
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      </button>

      <div
        className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <p className="text-white text-sm font-medium truncate drop-shadow-md">
          {image.name}
        </p>
      </div>
    </div>
  );
}
