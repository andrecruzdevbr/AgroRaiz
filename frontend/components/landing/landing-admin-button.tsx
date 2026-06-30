'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'

interface LandingAdminButtonProps {
  className?: string
  size?: 'default' | 'sm' | 'lg'
  fullWidth?: boolean
}

export function LandingAdminButton({
  className,
  size = 'default',
  fullWidth,
}: LandingAdminButtonProps) {
  const logout = useAuthStore((s) => s.logout)

  return (
    <Button
      size={size}
      className={cn('gap-2 shrink-0', fullWidth && 'w-full', className)}
      asChild
    >
      <Link
        href="/login"
        prefetch={false}
        onClick={() => logout()}
        data-testid="landing-admin-access"
        className={cn('inline-flex items-center justify-center gap-2', fullWidth && 'w-full')}
      >
        <LogIn className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">Entrar</span>
      </Link>
    </Button>
  )
}
