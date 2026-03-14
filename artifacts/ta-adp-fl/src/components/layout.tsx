import { Link, useLocation } from "wouter";
import { 
  Activity, 
  BarChart2, 
  Cpu, 
  ShieldCheck, 
  Settings, 
  FileText,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/simulation", label: "Run Simulation", icon: Settings },
  { href: "/rounds", label: "Training Rounds", icon: BarChart2 },
  { href: "/clients", label: "IoT Clients", icon: Cpu },
  { href: "/privacy", label: "Privacy Analysis", icon: ShieldCheck },
  { href: "/about", label: "About TA-ADP", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-r border-white/10 bg-card/40 backdrop-blur-xl">
        <div className="flex h-20 items-center px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-white">
              TA-ADP <span className="text-primary">FL</span>
            </span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer
                  ${isActive 
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)]" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  }
                `}>
                  <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="font-medium">{item.label}</span>
                  {isActive && (
                    <motion.div 
                      layoutId="activeTab" 
                      className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" 
                      initial={false}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-6 border-t border-white/10">
          <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
            <p className="text-xs text-primary font-mono mb-1">SYSTEM STATUS</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm text-white font-medium">All nodes online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-20 px-6"
          >
            <nav className="flex flex-col space-y-4">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-4 p-4 rounded-xl text-lg
                    ${location === item.href ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground"}`}
                  >
                    <item.icon className="h-6 w-6" />
                    {item.label}
                  </div>
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative scroll-smooth">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none -z-10" />
        <div className="max-w-7xl mx-auto p-6 md:p-8 lg:p-10 min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
