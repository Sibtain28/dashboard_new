import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare } from 'lucide-react';
import './LandingScreen.css';

function LandingScreen() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="landing-layout">
      {/* Full Screen Video Background - No blur, full quality */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="landing-video"
      >
        <source src="/video/YTDown.com_YouTube_Jindal-Steel-Corporate-Film_Media_Y37Nioh9LLA_002_720p.mp4" type="video/mp4" />
      </video>
      
      {/* Simple dark overlay to ensure text readability if needed, but keeping it very subtle to retain quality */}
      <div className="landing-overlay" />

      {/* Top Left Logo */}
      <div className="landing-header">
        <img src="/photo/logo.png" alt="Jindal Steel Logo" className="landing-logo" />
      </div>

      {/* Center Content / Navigation */}
      <div className={`landing-content ${mounted ? 'fade-in' : ''}`}>
        <h1 className="landing-title">Welcome to Jindal Steel</h1>
        <p className="landing-subtitle">Power Plant Dashboard and SteelAI</p>
        
        <div className="landing-actions">
          <button 
            onClick={() => navigate('/app/dashboard')}
            className="landing-btn dashboard-btn"
          >
            <LayoutDashboard size={20} />
            <span>Enter Dashboard</span>
          </button>
          
          <button 
            onClick={() => navigate('/app/chatbot')}
            className="landing-btn chatbot-btn"
          >
            <MessageSquare size={20} />
            <span>AI Chatbot</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingScreen;
