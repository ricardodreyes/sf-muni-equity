import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Rankings from './pages/Rankings'
import Methodology from './pages/Methodology'
import Live from './pages/Live'

function App() {
  const location = useLocation()
  const isLive = location.pathname === '/live'

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explorer" element={<Navigate to="/" replace />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/live" element={<Live />} />
        </Routes>
      </main>
      {!isLive && <Footer />}
    </div>
  )
}

export default App
