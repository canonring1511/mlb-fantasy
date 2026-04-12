import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/',        icon: '🏟️',  label: '我的陣容' },
  { path: '/fa',      icon: '🔍',  label: 'FA 分析' },
  { path: '/savant',  icon: '📊',  label: 'Savant' },
  { path: '/settings',icon: '⚙️',  label: '設定' },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 safe-bottom z-50">
      <div className="flex">
        {tabs.map(tab => {
          const active = location.pathname === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                active ? 'text-blue-400' : 'text-slate-400'
              }`}
            >
              <span className="text-xl leading-none mb-0.5">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
