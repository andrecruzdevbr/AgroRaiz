'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Store, Bell, Phone, Loader2, Globe, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
        <h1 className="text-2xl lg:text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie os dados da loja exibidos no site vitrine
        </p>
      </motion.div>

      <Tabs defaultValue="loja">
        <TabsList>
          <TabsTrigger value="loja">Dados da Loja</TabsTrigger>
          <TabsTrigger value="vitrine">Site Vitrine</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="loja" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <Store className="w-4 h-4" /> Informações principais
              </CardTitle>
              <CardDescription>
                Dados de contato e localização exibidos no site e nos canais de atendimento
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
                <Label htmlFor="tagline">Slogan ou descrição curta</Label>
                <Input
                  id="tagline"
                  value={form.tagline}
                  onChange={(e) => setField('tagline', e.target.value)}
                  placeholder="Ex: Qualidade do campo para sua casa"
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
                  <Label htmlFor="whatsapp">WhatsApp *</Label>
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
                <Label htmlFor="instagram_url">Link do Instagram (opcional)</Label>
                <Input
                  id="instagram_url"
                  value={form.links.instagram_url}
                  onChange={(e) =>
                    setField('links', { ...form.links, instagram_url: e.target.value })
                  }
                  placeholder="https://instagram.com/sua_loja"
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
                <Label htmlFor="logo_url">URL da logo</Label>
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
        </TabsContent>

        <TabsContent value="vitrine" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <MapPin className="w-4 h-4" /> Página inicial do site
              </CardTitle>
              <CardDescription>
                Textos exibidos na vitrine pública em{' '}
                <a href="/" target="_blank" className="text-primary hover:underline">
                  localhost:3000
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'hero_badge' as const, label: 'Selo do topo', placeholder: 'Ex: Promoção da semana' },
                { key: 'hero_title' as const, label: 'Título principal', placeholder: 'Deixe vazio para usar o nome da loja' },
                { key: 'hero_subtitle' as const, label: 'Texto de apresentação', textarea: true },
                { key: 'hero_cta_label' as const, label: 'Texto do botão principal', placeholder: 'Falar no WhatsApp' },
                { key: 'promo_message' as const, label: 'Mensagem de promoção ou campanha', placeholder: 'Ex: Frete grátis na região' },
                { key: 'whatsapp_message' as const, label: 'Mensagem padrão do WhatsApp', placeholder: 'Olá! Vim pelo site...' },
                { key: 'about_title' as const, label: 'Título da seção Sobre' },
                { key: 'about_text' as const, label: 'Texto sobre a loja', textarea: true },
                { key: 'products_title' as const, label: 'Título da seção Produtos' },
                { key: 'products_intro' as const, label: 'Introdução dos produtos', textarea: true },
                { key: 'cta_title' as const, label: 'Título do convite final' },
                { key: 'cta_text' as const, label: 'Texto do convite final', textarea: true },
              ].map(({ key, label, placeholder, textarea }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key}>{label}</Label>
                  {textarea ? (
                    <Textarea
                      id={key}
                      rows={3}
                      value={form.vitrine[key] as string}
                      onChange={(e) => setVitrine(key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={key}
                      value={form.vitrine[key] as string}
                      onChange={(e) => setVitrine(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  )}
                </div>
              ))}

              <div className="space-y-2">
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
            {updateProfile.isPending ? 'Salvando...' : 'Salvar site vitrine'}
          </Button>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <Phone className="w-4 h-4" /> Evolution API
              </CardTitle>
              <CardDescription>
                Configuração técnica da integração WhatsApp (via variáveis de ambiente)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A integração real do WhatsApp é configurada pelo administrador do sistema.
                O número exibido no site vem do campo WhatsApp em Dados da Loja.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex gap-2">
                <Bell className="w-4 h-4" /> Notificações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: 'Novo pedido', desc: 'Notificar quando um pedido for criado' },
                { label: 'Estoque baixo', desc: 'Alertar quando produto atingir estoque mínimo' },
                { label: 'Conversa aguardando', desc: 'Alertar quando IA transferir para humano' },
              ].map(({ label, desc }) => (
                <div
                  key={label}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
