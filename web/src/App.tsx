import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Brand from './pages/Brand'
import Clip from './pages/Clip'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo">
          Brand Voice Eval
        </Link>
        <span className="subtitle">
          Test how OpusClip prompts respond to brand voice
        </span>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/brands/:id" element={<Brand />} />
          <Route path="/clips/:id" element={<Clip />} />
        </Routes>
      </main>
    </div>
  )
}
