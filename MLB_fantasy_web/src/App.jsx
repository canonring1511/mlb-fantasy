import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import RosterPage from './pages/RosterPage'
import FAPage from './pages/FAPage'
import SavantPage from './pages/SavantPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 safe-top">
        <Routes>
          <Route path="/"         element={<RosterPage />} />
          <Route path="/fa"       element={<FAPage />} />
          <Route path="/savant"   element={<SavantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
