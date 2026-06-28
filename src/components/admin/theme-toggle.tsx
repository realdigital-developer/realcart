'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-lg hover:bg-secondary/80 relative overflow-hidden group"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <div className="relative z-10">
        {theme === 'dark' ? (
          <Sun className="h-4 w-4 text-amber-400 group-hover:text-amber-300 transition-colors" />
        ) : (
          <Moon className="h-4 w-4 text-primary group-hover:text-primary/80 transition-colors" />
        )}
      </div>
      {theme === 'dark' && (
        <div className="absolute inset-0 bg-amber-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      {theme !== 'dark' && (
        <div className="absolute inset-0 bg-primary/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
