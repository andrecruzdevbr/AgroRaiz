'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  LayoutDashboard, 
  Users, 
  Package, ShieldCheck, 
  MessageSquare, 
  Bot,
  Megaphone,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Leaf,
  Bell,
  Search,
  LogOut,
  Home,
  Instagram,
  Phone
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

const menuItems = [
  { 
    href: '/admin', 
    label: 'Dashboard', 
    icon: LayoutDashboard,
    description: 'Visão geral do sistema'
  },
  { 
    href: '/admin/clientes', 
    label: 'Clientes', 
    icon: Users,
    description: 'Gestão de clientes e CRM'
  },
  { 
    href: '/admin/produtos', 
    label: 'Produtos', 
    icon: Package, ShieldCheck,
    description: 'Estoque e catálogo'
  },
  { 
    href: '/admin/estoque-inteligente', 
    label: 'Est. Inteligente', 
    icon: ShieldCheck,
    description: 'Confirmação e rankings'
  },
  { 
    href: '/admin/conversas', 
    label: 'Conversas', 
    icon: MessageSquare,
    description: 'Central de atendimento'
  },
  { 
    href: '/admin/ia', 
    label: 'Central IA', 
    icon: Bot,
    description: 'Configuração da IA'
  },
  { 
    href: '/admin/campanhas', 
    label: 'Campanhas', 
    icon: Megaphone,
    description: 'Marketing e automações'
  },
  { 
    href: '/admin/analytics', 
    label: 'Analytics', 
    icon: BarChart3,
    description: 'Relatórios e métricas'
  },
  { 
    href: '/admin/instagram', 
    label: 'Instagram', 
    icon: Instagram,
    description: 'Directs, posts e conteúdo'
  },
  { 
    href: '/admin/configuracoes', 
    label: 'Configurações', 
    icon: Settings,
    description: 'Configurações do sistema'
  },
]

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-sidebar border-b border-sidebar-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-sidebar-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center">
              <Leaf className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-bold text-sidebar-foreground">AgroRaiz</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors relative">
            <Bell className="w-5 h-5 text-sidebar-foreground" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-sidebar border-r border-sidebar-border"
            >
              <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center">
                    <Leaf className="w-4 h-4 text-sidebar-primary-foreground" />
                  </div>
                  <span className="font-bold text-sidebar-foreground">Agro Raiz</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5 text-sidebar-foreground" />
                </button>
              </div>
              <nav className="p-4 space-y-1">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== '/admin' && pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        isActive 
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                          : 'text-sidebar-foreground hover:bg-sidebar-accent'
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
              <div className="absolute bottom-4 left-4 right-4 space-y-2">
                <Link
                  href="/"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Voltar ao Site</span>
                </Link>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed top-0 left-0 bottom-0 z-40 bg-sidebar border-r border-sidebar-border transition-all duration-300',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 border-b border-sidebar-border px-4',
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        )}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center">
              <Leaf className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-bold text-lg text-sidebar-foreground">Agro Raiz</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
              aria-label="Recolher menu"
            >
              <ChevronLeft className="w-4 h-4 text-sidebar-foreground" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="mx-auto mt-4 p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
            aria-label="Expandir menu"
          >
            <ChevronRight className="w-4 h-4 text-sidebar-foreground" />
          </button>
        )}

        {/* Navigation */}
        <nav className={cn('flex-1 p-4 space-y-1', sidebarCollapsed && 'px-2')}>
          {menuItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg transition-colors',
                  sidebarCollapsed ? 'px-3 py-2.5 justify-center' : 'px-3 py-2.5',
                  isActive 
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground' 
                    : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block">{item.label}</span>
                    <span className="text-xs opacity-70 truncate block">
                      {item.description}
                    </span>
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className={cn(
          'p-4 border-t border-sidebar-border space-y-2',
          sidebarCollapsed && 'px-2'
        )}>
          <Link
            href="/"
            title={sidebarCollapsed ? 'Voltar ao Site' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
              sidebarCollapsed ? 'px-3 py-2.5 justify-center' : 'px-3 py-2.5'
            )}
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Voltar ao Site</span>}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Sair' : undefined}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
              sidebarCollapsed ? 'px-3 py-2.5 justify-center' : 'px-3 py-2.5'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          'min-h-screen transition-all duration-300 pt-16 lg:pt-0',
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        )}
      >
        {/* Top Bar */}
        <header className="hidden lg:flex h-16 bg-card border-b border-border px-6 items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar clientes, produtos, conversas..." 
                className="pl-10 bg-background"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://instagram.com/_agroraiz_"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="w-5 h-5 text-muted-foreground" />
            </a>
            <a
              href="https://wa.me/5531995122303"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="WhatsApp"
            >
              <Phone className="w-5 h-5 text-muted-foreground" />
            </a>
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            </button>
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">AR</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
