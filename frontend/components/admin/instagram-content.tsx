'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Instagram, MessageCircle, Heart, Image, ExternalLink, Sparkles, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { aiApi, getAccessToken } from '@/lib/api'

export function InstagramContent() {
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [publishCaption, setPublishCaption] = useState('')
  const [publishUrl, setPublishUrl] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetchMedia() }, [])

  const fetchMedia = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/instagram/media', {
        headers: { Authorization: `Bearer ${getAccessToken()}` }
      })
      const data = await res.json()
      setMedia(data.media || [])
    } catch { /* silent - instagram may not be configured */ }
    finally { setLoading(false) }
  }

  const handleGenerateCaption = async () => {
    setGenerating(true)
    try {
      const result = await aiApi.generateContent('post') as any
      if (result.caption) {
        setPublishCaption(result.caption + '\n\n' + (result.hashtags || []).map((h: string) => `#${h}`).join(' '))
        toast.success('Legenda gerada pela IA!')
      }
    } catch { toast.error('Erro ao gerar legenda') }
    finally { setGenerating(false) }
  }

  const handlePublish = async () => {
    if (!publishUrl || !publishCaption) return
    try {
      const res = await fetch('/api/v1/instagram/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ image_url: publishUrl, caption: publishCaption }),
      })
      if (res.ok) {
        toast.success('Post publicado no Instagram!')
        setPublishCaption('')
        setPublishUrl('')
        fetchMedia()
      } else {
        toast.error('Erro ao publicar. Verifique as configurações do Instagram.')
      }
    } catch { toast.error('Erro ao publicar') }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Instagram</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Central de gestão e publicação
          </p>
        </div>
        <a href="https://www.instagram.com/_agroraiz_" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2">
            <Instagram className="w-4 h-4" />
            @_agroraiz_
            <ExternalLink className="w-3 h-3" />
          </Button>
        </a>
      </motion.div>

      <Tabs defaultValue="publish">
        <TabsList>
          <TabsTrigger value="publish">Publicar</TabsTrigger>
          <TabsTrigger value="feed">Feed recente</TabsTrigger>
          <TabsTrigger value="dms">Mensagens diretas</TabsTrigger>
        </TabsList>

        <TabsContent value="publish" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Novo post</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>URL da imagem</Label>
                  <Input
                    placeholder="https://..."
                    value={publishUrl}
                    onChange={e => setPublishUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Legenda</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateCaption}
                      disabled={generating}
                      className="gap-1 h-7 text-xs text-primary"
                    >
                      <Sparkles className="w-3 h-3" />
                      {generating ? 'Gerando...' : 'Gerar com IA'}
                    </Button>
                  </div>
                  <Textarea
                    value={publishCaption}
                    onChange={e => setPublishCaption(e.target.value)}
                    placeholder="Escreva ou gere com IA..."
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {publishCaption.length}/2200 chars
                  </p>
                </div>
                <Button
                  onClick={handlePublish}
                  disabled={!publishUrl || !publishCaption}
                  className="w-full gap-2"
                >
                  <Send className="w-4 h-4" />
                  Publicar no Instagram
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="border rounded-xl overflow-hidden bg-card">
                  {publishUrl ? (
                    <img src={publishUrl} alt="preview" className="w-full aspect-square object-cover" onError={() => {}} />
                  ) : (
                    <div className="aspect-square flex items-center justify-center bg-muted">
                      <Image className="w-10 h-10 text-muted-foreground opacity-30" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                        <Instagram className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">agroraiz</span>
                    </div>
                    <p className="text-xs whitespace-pre-line line-clamp-4">
                      {publishCaption || 'Sua legenda aparecerá aqui...'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="feed" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : media.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
                <Instagram className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">Instagram não configurado</p>
                <p className="text-sm">Configure o token na aba Configurações</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {media.map((post: any) => (
                <div key={post.id} className="relative group aspect-square bg-muted rounded-xl overflow-hidden">
                  {post.thumbnail_url && (
                    <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <div className="text-white text-xs flex gap-3">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {post.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> {post.comments_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dms" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
              <MessageCircle className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">Mensagens Diretas</p>
              <p className="text-sm">Requer conta Instagram Business configurada</p>
              <p className="text-xs mt-2 text-center max-w-xs">
                Configure o Instagram Business ID e o token de acesso nas Configurações para ativar esta funcionalidade.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
