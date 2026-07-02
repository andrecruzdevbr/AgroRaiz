'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Store, Loader2, Globe, MapPin, LayoutTemplate } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { useStoreProfile, useUpdateStoreProfile } from '@/lib/hooks'
import type { StoreProfile, StoreVitrineSettings } from '@/lib/api'
import { formatPhoneInput, isValidBRPhone, toE164BR } from '@/lib/phone'

const emptyVitrine = (): StoreVitrineSettings => ({
  hero_badge: '',
  hero_title: '',
  hero_subtitle: '',
  hero_cta_label: 'Falar no WhatsApp',
  about_title: '',
  about_text: '',
  about_text_extra: '',
  products_title: '',
  products_intro: '',
  cta_title: '',
  cta_text: '',
  promo_message: '',
  whatsapp_message: 'Olá! Vim pelo site e gostaria de mais informações.',
  featured_categories: [],
  testimonials: [],
})

function profileToForm(p: StoreProfile) {
  return {
    name: p.name || '',
    tagline: p.tagline || '',
    short_description: p.short_description || '',
    description: p.description || '',
    phone: p.phone_display || p.phone || '',
    whatsapp: p.whatsapp_display || p.whatsapp || '',
    email: p.email || '',
    instagram: p.instagram || '',
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    opening_hours: p.opening_hours || '',
    logo_url: p.logo_url || '',
    vitrine: { ...emptyVitrine(), ...p.vitrine },
    links: {
      instagram_url: p.links?.instagram_url || '',
      google_maps_url: p.links?.google_maps_url || '',
      whatsapp_url: p.links?.whatsapp_url || '',
    },
  }
}

type FormState = ReturnType<typeof profileToForm>

export function ConfiguracoesContent() {
  const { data: profile, isLoading } = useStoreProfile()
  const updateProfile = useUpdateStoreProfile()
  const [form, setForm] = useState<FormState | null>(null)

  useEffect(() => {
    if (profile) setForm(profileToForm(profile))
  }, [profile])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const setVitrine = (key: keyof StoreVitrineSettings, value: string | string[]) => {
    setForm((prev) =>
      prev ? { ...prev, vitrine: { ...prev.vitrine, [key]: value } } : prev,
    )
  }

  const toggleCategory = (key: string) => {
    setForm((prev) => {
      if (!prev) return prev
      const current = prev.vitrine.featured_categories || []
      const next = current.includes(key)
        ? current.filter((c) => c !== key)
        : [...current, key].slice(0, 6)
      return { ...prev, vitrine: { ...prev.vitrine, featured_categories: next } }
    })
  }

  const handleSaveStore = async () => {
    if (!form) return

    if (!form.name.trim()) {
      toast.error('Informe o nome da loja')
      return
    }
    if (form.whatsapp && !isValidBRPhone(form.whatsapp)) {
      toast.error('WhatsApp inválido. Use DDD + número.')
      return
    }
    if (form.phone && !isValidBRPhone(form.phone)) {
      toast.error('Telefone inválido. Use DDD + número.')
      return
    }
    if (form.state && form.state.length !== 2) {
      toast.error('Estado deve ter 2 letras (ex: MG)')
      return
    }

    try {
      await updateProfile.mutateAsync({
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        short_description: form.short_description.trim(),
        description: form.description.trim(),
        phone: form.phone ? toE164BR(form.phone) : null,
        whatsapp: form.whatsapp ? toE164BR(form.whatsapp) : null,
        email: form.email.trim() || null,
        instagram: form.instagram.trim() || null,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        opening_hours: form.opening_hours.trim(),
        logo_url: form.logo_url.trim() || null,
        vitrine: form.vitrine,
        links: form.links,
      })
      toast.success('Dados da loja salvos! O site vitrine será atualizado.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const categories = profile?.available_categories || []

  return (
    <div className="space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl lg:text-3xl font-bold">Dados da Loja</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Informações exibidas no site vitrine e usadas nos canais de atendimento
        </p>
      </motion.div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex gap-2">
              <Store className="w-4 h-4" /> Informações principais
            </CardTitle>
            <CardDescription>
              Contato e localização da loja
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Nome da loja *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tagline">Slogan</Label>
              <Input
                id="tagline"
                value={form.tagline}
                onChange={(e) => setField('tagline', e.target.value)}
                placeholder="Ex: Qualidade do campo para sua casa"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="short_description">Descrição curta</Label>
              <Textarea
                id="short_description"
                rows={2}
                value={form.short_description}
                onChange={(e) => setField('short_description', e.target.value)}
                placeholder="Resumo em uma ou duas frases sobre a loja"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Descrição completa</Label>
              <Textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setField('phone', formatPhoneInput(e.target.value))}
                  placeholder="(31) 99999-9999"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => setField('whatsapp', formatPhoneInput(e.target.value))}
                  placeholder="(31) 99999-9999"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="state">Estado (UF)</Label>
                <Input
                  id="state"
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setField('state', e.target.value.toUpperCase())}
                  placeholder="MG"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="opening_hours">Horário de funcionamento</Label>
              <Input
                id="opening_hours"
                value={form.opening_hours}
                onChange={(e) => setField('opening_hours', e.target.value)}
                placeholder="Seg-Sáb: 7h às 18h"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex gap-2">
              <Globe className="w-4 h-4" /> Presença digital
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                value={form.instagram}
                onChange={(e) => setField('instagram', e.target.value)}
                placeholder="@sua_loja ou URL completa"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="google_maps">Link do Google Maps</Label>
              <Input
                id="google_maps"
                value={form.links.google_maps_url}
                onChange={(e) =>
                  setField('links', { ...form.links, google_maps_url: e.target.value })
                }
                placeholder="https://maps.google.com/..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whatsapp_url">Link direto do WhatsApp (opcional)</Label>
              <Input
                id="whatsapp_url"
                value={form.links.whatsapp_url}
                onChange={(e) =>
                  setField('links', { ...form.links, whatsapp_url: e.target.value })
                }
                placeholder="Deixe vazio para gerar automaticamente pelo número"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="logo_url">URL da logo ou imagem da loja</Label>
              <Input
                id="logo_url"
                value={form.logo_url}
                onChange={(e) => setField('logo_url', e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Cole o link de uma imagem já hospedada na internet
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex gap-2">
              <LayoutTemplate className="w-4 h-4" /> Conteúdo do site vitrine
            </CardTitle>
            <CardDescription>
              Textos da página inicial —{' '}
              <a href="/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                ver site
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="hero_title">Título principal</Label>
              <Input
                id="hero_title"
                value={form.vitrine.hero_title}
                onChange={(e) => setVitrine('hero_title', e.target.value)}
                placeholder="Deixe vazio para usar o nome da loja"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hero_subtitle">Texto de apresentação</Label>
              <Textarea
                id="hero_subtitle"
                rows={3}
                value={form.vitrine.hero_subtitle}
                onChange={(e) => setVitrine('hero_subtitle', e.target.value)}
                placeholder="Deixe vazio para usar a descrição curta da loja"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hero_cta_label">Texto do botão principal</Label>
              <Input
                id="hero_cta_label"
                value={form.vitrine.hero_cta_label}
                onChange={(e) => setVitrine('hero_cta_label', e.target.value)}
                placeholder="Falar no WhatsApp"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="promo_message">Mensagem de promoção ou destaque</Label>
              <Input
                id="promo_message"
                value={form.vitrine.promo_message}
                onChange={(e) => setVitrine('promo_message', e.target.value)}
                placeholder="Ex: Frete grátis na região"
              />
            </div>

            <div className="space-y-2 pt-2">
              <Label>Categorias em destaque (até 6)</Label>
              <p className="text-xs text-muted-foreground">
                Se nenhuma for selecionada, o site mostra as categorias com mais produtos
              </p>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                {categories.map((cat) => (
                  <label
                    key={cat.key}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={form.vitrine.featured_categories.includes(cat.key)}
                      onCheckedChange={() => toggleCategory(cat.key)}
                    />
                    <span className="text-sm">{cat.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSaveStore}
          className="w-full"
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar dados da loja'
          )}
        </Button>
      </div>
    </div>
  )
}
