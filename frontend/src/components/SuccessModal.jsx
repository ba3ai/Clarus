// src/components/SuccessModal.jsx
import React from "react";

const SuccessModal = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 text-center animate-fade-in">
        <h2 className="text-2xl font-bold text-green-600 mb-4">✅ Success</h2>
        <p className="text-gray-700 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default SuccessModal;
