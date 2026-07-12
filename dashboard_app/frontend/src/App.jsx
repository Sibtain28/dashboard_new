import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import MainLayout from './MainLayout';
import Dashboard from './Dashboard';
import ChatbotPage from './ChatbotPage';
import JindalAuth from './JindalAuth';
import LandingScreen from './LandingScreen';
import './App.css';

function App() {
  // Use a fallback if the env var isn't set
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your_google_client_id_here';

  console.log("Google Client ID in use:", clientId);
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <Routes>
          {/* Landing screen with video (shown after login/signup or for default access) */}
          <Route path="/" element={localStorage.getItem('token') ? <LandingScreen /> : <Navigate to="/login" replace />} />

          {/* Authentication */}
          <Route path="/login" element={<JindalAuth />} />
          <Route path="/signup" element={<Navigate to="/login" replace />} />

          {/* Main application shell (Dashboard & Chatbot with light theme) */}
          <Route path="/app" element={localStorage.getItem('token') ? <MainLayout /> : <Navigate to="/login" replace />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="chatbot" element={<ChatbotPage />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
