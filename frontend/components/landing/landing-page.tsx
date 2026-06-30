'use client'

import {
  Header,
  HeroSection,
  AboutSection,
  ProductsSection,
  CTASection,
  Footer,
} from '@/components/landing/landing-sections'
import { LandingProvider } from '@/components/landing/landing-provider'
import { useStoreVitrine } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'

export function LandingPage() {
  const { data, isLoading, isError } = useStoreVitrine()

  if (isLoading) {
    return (
      <div className="min-h-screen p-8 space-y-6">
        <Skeleton className="h-16 w-full max-w-4xl mx-auto" />
        <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground text-center">
          Não foi possível carregar os dados da loja. Tente atualizar a página.
        </p>
      </div>
    )
  }

  return (
    <LandingProvider data={data}>
      <main className="min-h-screen">
        <Header />
        <HeroSection />
        <AboutSection />
        <ProductsSection />
        <CTASection />
        <Footer />
      </main>
    </LandingProvider>
  )
}
