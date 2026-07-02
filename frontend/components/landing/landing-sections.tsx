'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu,
  X,
  Instagram,
  Phone,
  MapPin,
  Clock,
  ChevronRight,
  Leaf,
  Heart,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLandingStore } from '@/components/landing/landing-provider'
import { LandingAdminButton } from '@/components/landing/landing-admin-button'

const navLinks = [
  { href: '#inicio', label: 'Início' },
  { href: '#sobre', label: 'Sobre' },
  { href: '#produtos', label: 'Produtos' },
  { href: '#contato', label: 'Contato' },
]

function WhatsAppButton({
  href,
  children,
  className,
  size = 'default',
  variant = 'default',
}: {
  href: string | null | undefined
  children: React.ReactNode
  className?: string
  size?: 'default' | 'lg'
  variant?: 'default' | 'outline' | 'secondary'
}) {
  if (!href) return null
  return (
    <Button size={size} variant={variant} asChild className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    </Button>
  )
}

export function Header() {
  const store = useLandingStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const igLink = store.links.instagram_url || store.instagram_url

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const nameParts = store.name.trim().split(/\s+/)
  const firstName = nameParts[0] || store.name
  const restName = nameParts.slice(1).join(' ')

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-background/95 backdrop-blur-md shadow-sm border-b border-border'
          : 'bg-transparent',
      )}
    >
      <nav className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link href="/" className="flex items-center gap-2">
            {store.logo_url ? (
              <Image
                src={store.logo_url}
                alt={store.name}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Leaf className="w-6 h-6 text-primary-foreground" />
              </div>
            )}
            <span className="font-bold text-xl text-foreground">
              {firstName}
              {restName ? (
                <span className="text-primary"> {restName}</span>
              ) : null}
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            {igLink && (
              <a
                href={igLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full hover:bg-secondary transition-colors shrink-0"
              >
                <Instagram className="w-5 h-5 text-muted-foreground hover:text-primary" />
              </a>
            )}
            <LandingAdminButton className="shrink-0" />
            <WhatsAppButton href={store.whatsapp_link} className="gap-2 shrink-0">
              <Phone className="w-4 h-4" />
              Fale Conosco
            </WhatsAppButton>
          </div>

          <div className="flex lg:hidden items-center gap-2">
            <LandingAdminButton size="sm" className="h-9 px-3 text-xs sm:text-sm" />
            <button
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-foreground" />
              ) : (
                <Menu className="w-6 h-6 text-foreground" />
              )}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-background border-t border-border"
          >
            <div className="container mx-auto px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block py-3 px-4 rounded-lg text-foreground hover:bg-secondary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="pt-4 border-t border-border">
                <WhatsAppButton href={store.whatsapp_link} className="w-full gap-2">
                  <Phone className="w-4 h-4" />
                  Fale Conosco no WhatsApp
                </WhatsAppButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

export function HeroSection() {
  const store = useLandingStore()
  const v = store.vitrine
  const promo = v.promo_message?.trim()

  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-16 lg:pt-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-secondary via-background to-accent/20" />

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            {(v.hero_badge || promo) && (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Leaf className="w-4 h-4" />
                {promo || v.hero_badge}
              </span>
            )}

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight text-balance">
              {v.hero_title}
            </h1>

            {v.hero_subtitle && (
              <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 text-pretty">
                {v.hero_subtitle}
              </p>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <WhatsAppButton href={store.whatsapp_link} size="lg" className="gap-2 text-base">
                <Phone className="w-5 h-5" />
                {v.hero_cta_label || 'Falar no WhatsApp'}
              </WhatsAppButton>
              <Button size="lg" variant="outline" asChild className="gap-2 text-base">
                <a href="#produtos">
                  Ver Produtos
                  <ChevronRight className="w-4 h-4" />
                </a>
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-6 max-w-sm mx-auto lg:mx-0">
              <div>
                <span className="block text-2xl font-bold text-primary">
                  {store.stats.products_count}
                </span>
                <span className="text-sm text-muted-foreground">Produtos no catálogo</span>
              </div>
              <div>
                <span className="block text-2xl font-bold text-primary">
                  {store.stats.categories_count}
                </span>
                <span className="text-sm text-muted-foreground">Categorias</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <div className="relative aspect-square max-w-lg mx-auto">
              <div className="relative z-10 bg-card rounded-3xl shadow-2xl p-8 border border-border">
                <div className="grid grid-cols-2 gap-4">
                  {(store.featured_categories.length > 0
                    ? store.featured_categories.slice(0, 4)
                    : []
                  ).map((cat, i) => (
                    <motion.div
                      key={cat.key}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
                      className="bg-gradient-to-br from-primary/80 to-primary p-4 rounded-2xl text-primary-foreground"
                    >
                      <h3 className="font-bold">{cat.label}</h3>
                      <p className="text-sm opacity-90">{cat.count} produtos</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function AboutSection() {
  const store = useLandingStore()
  const v = store.vitrine
  const igLink = store.links.instagram_url || store.instagram_url
  const mapsLink = store.links.google_maps_url

  const aboutTitle =
    v.about_title ||
    (store.name ? `Conheça a ${store.name}` : 'Conheça nossa loja')

  return (
    <section id="sobre" className="py-20 lg:py-32 bg-card">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              {store.logo_url ? (
                <Image
                  src={store.logo_url}
                  alt={store.name}
                  width={160}
                  height={160}
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="text-center">
                  <Leaf className="w-24 h-24 text-primary mx-auto mb-4" />
                  <p className="text-2xl font-bold text-foreground">{store.name}</p>
                </div>
              )}
            </div>

            {store.city_state && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="absolute -bottom-6 -right-6 bg-background p-6 rounded-xl shadow-lg border border-border"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{store.city}</p>
                    <p className="text-sm text-muted-foreground">{store.state}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-6">
              Sobre Nós
            </span>

            <h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">
              {aboutTitle}
            </h2>

            {v.about_text && (
              <p className="mt-6 text-muted-foreground text-lg">{v.about_text}</p>
            )}
            {v.about_text_extra && (
              <p className="mt-4 text-muted-foreground">{v.about_text_extra}</p>
            )}
            {!v.about_text && store.description && (
              <p className="mt-6 text-muted-foreground text-lg">{store.description}</p>
            )}

            <div className="mt-8 grid sm:grid-cols-2 gap-4">
              {store.opening_hours && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50">
                  <Clock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Horário</p>
                    <p className="text-sm text-muted-foreground">{store.opening_hours}</p>
                  </div>
                </div>
              )}
              {(store.whatsapp_display || store.phone_display) && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50">
                  <Phone className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">WhatsApp</p>
                    <p className="text-sm text-muted-foreground">
                      {store.whatsapp_display || store.phone_display}
                    </p>
                  </div>
                </div>
              )}
              {(store.address || store.city_state) && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Endereço</p>
                    <p className="text-sm text-muted-foreground">
                      {store.address || store.city_state}
                    </p>
                    {mapsLink && (
                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        Ver no mapa
                      </a>
                    )}
                  </div>
                </div>
              )}
              {store.instagram && igLink && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary/50">
                  <Instagram className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Instagram</p>
                    <a
                      href={igLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      {store.instagram}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function ProductsSection() {
  const store = useLandingStore()
  const v = store.vitrine
  const categories = store.featured_categories

  if (categories.length === 0) return null

  return (
    <section id="produtos" className="py-20 lg:py-32 bg-background">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-6">
            Nossos Produtos
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-balance">
            {v.products_title || 'Produtos em destaque'}
          </h2>
          {v.products_intro && (
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">{v.products_intro}</p>
          )}
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category, index) => (
            <motion.div
              key={category.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="group bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Heart className="w-6 h-6 text-primary" />
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2">{category.label}</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {category.count} {category.count === 1 ? 'produto' : 'produtos'} disponíveis
              </p>

              {category.sample_products.length > 0 && (
                <ul className="space-y-2">
                  {category.sample_products.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-12 text-center"
        >
          <WhatsAppButton href={store.whatsapp_link} size="lg" className="gap-2">
            <Phone className="w-5 h-5" />
            Consultar Disponibilidade
          </WhatsAppButton>
        </motion.div>
      </div>
    </section>
  )
}

export function CTASection() {
  const store = useLandingStore()
  const v = store.vitrine
  const igLink = store.links.instagram_url || store.instagram_url

  return (
    <section className="py-20 lg:py-32 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-balance">
            {v.cta_title || `Fale com a ${store.name}`}
          </h2>
          {v.cta_text && (
            <p className="mt-4 text-primary-foreground/90 text-lg">{v.cta_text}</p>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <WhatsAppButton
              href={store.whatsapp_link}
              size="lg"
              variant="secondary"
              className="gap-2 text-base"
            >
              <Phone className="w-5 h-5" />
              Chamar no WhatsApp
            </WhatsAppButton>
            {igLink && (
              <Button
                size="lg"
                variant="outline"
                asChild
                className="gap-2 text-base border-primary-foreground/30 hover:bg-primary-foreground/10"
              >
                <a href={igLink} target="_blank" rel="noopener noreferrer">
                  <Instagram className="w-5 h-5" />
                  Seguir no Instagram
                </a>
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function Footer() {
  const store = useLandingStore()
  const igLink = store.links.instagram_url || store.instagram_url

  const footerText =
    store.tagline ||
    store.short_description ||
    store.description ||
    (store.city_state
      ? `Produtos agropecuários e pet shop em ${store.city_state}.`
      : '')

  return (
    <footer id="contato" className="bg-sidebar text-sidebar-foreground py-16">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center">
                <Leaf className="w-6 h-6 text-sidebar-primary-foreground" />
              </div>
              <span className="font-bold text-xl">{store.name}</span>
            </div>
            {footerText && (
              <p className="text-sidebar-foreground/70 max-w-md">{footerText}</p>
            )}
            <div className="flex gap-4 mt-6">
              {igLink && (
                <a
                  href={igLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center hover:bg-sidebar-primary transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {store.whatsapp_link && (
                <a
                  href={store.whatsapp_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center hover:bg-sidebar-primary transition-colors"
                  aria-label="WhatsApp"
                >
                  <Phone className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Contato</h3>
            <ul className="space-y-3">
              {(store.whatsapp_display || store.phone_display) && (
                <li className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-sidebar-primary mt-0.5" />
                  <span className="text-sidebar-foreground/70">
                    {store.whatsapp_display || store.phone_display}
                  </span>
                </li>
              )}
              {(store.address || store.city_state) && (
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-sidebar-primary mt-0.5" />
                  <span className="text-sidebar-foreground/70">
                    {store.address || store.city_state}
                  </span>
                </li>
              )}
              {store.opening_hours && (
                <li className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-sidebar-primary mt-0.5" />
                  <span className="text-sidebar-foreground/70">{store.opening_hours}</span>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-4">Links</h3>
            <ul className="space-y-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/login"
                  className="text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                >
                  Área Administrativa
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-sidebar-border text-center">
          <p className="text-sidebar-foreground/50 text-sm">
            &copy; {new Date().getFullYear()} {store.name}. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
