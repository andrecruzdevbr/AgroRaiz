'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Bot, Zap, MessageSquare, Clock, Sparkles, Send, RefreshCw, Play, Settings } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { aiApi, getAccessToken } from '@/lib/api'

const fadeInUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } }

export function IACentralContent() {
  const [metrics, setMetrics] = useState<any>(null)
  const [testMessage, setTestMessage] = useState('')
  const [testResponse, setTestResponse] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [contentType, setContentType] = useState('post')
  const [contentTopic, setContentTopic] = useState('')
  const [generatedContent, setGeneratedContent] = useState<any>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [persona, setPersona] = useState<any>(null)

  useEffect(() => {
    fetchMetrics()
    fetchPersona()
  }, [])

  const fetchMetrics = async () => {
    try {
      const data = await aiApi.getMetrics() as any
      setMetrics(data)
    } catch { /* silent */ }
  }

  const fetchPersona = async () => {
    try {
      const data = await aiApi.generateContent('persona_info') as any
      // Will fail gracefully if no config endpoint
    } catch { /* silent */ }
  }

  const handleTest = async () => {
    if (!testMessage.trim()) return
    setTestLoading(true)
    try {
      const result = await fetch('/api/v1/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
        body: JSON.stringify({ message: testMessage, customer_phone: 'test_preview' }),
      }).then(r => r.json())
      setTestResponse(result)
    } catch {
      toast.error('Erro ao testar IA')
    } finally {
      setTestLoading(false)
    }
  }

  const handleGenerateContent = async () => {
    setContentLoading(true)
    try {
      const result = await aiApi.generateContent(contentType, contentTopic) as any
      setGeneratedContent(result)
      toast.success('Conteúdo gerado com sucesso!')
    } catch {
      toast.error('Erro ao gerar conteúdo')
    } finally {
      setContentLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeInUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Central IA</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gerencie a Ana, sua atendente virtual inteligente
          </p>
        </div>
        <Badge className="gap-2 bg-success/10 text-success border-success/30 px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          IA Ativa
        </Badge>
      </motion.div>

      {/* Metrics row */}
      <motion.div {...fadeInUp} transition={{ delay: 0.05 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Conversas resolvidas', value: metrics?.ai_resolved ?? '—', icon: MessageSquare },
          { label: 'Taxa de resolução', value: metrics ? `${metrics.ai_resolution_rate}%` : '—', icon: Zap },
          { label: 'Horas economizadas', value: metrics ? `${metrics.hours_saved}h` : '—', icon: Clock },
          { label: 'Transferências humanas', value: metrics?.human_takeovers ?? '—', icon: Bot },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Resolution progress */}
      {metrics && (
        <motion.div {...fadeInUp} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Ana — Eficiência de atendimento</p>
                    <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-primary">{metrics.ai_resolution_rate}%</span>
              </div>
              <Progress value={metrics.ai_resolution_rate} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                A Ana resolveu {metrics.ai_resolved} de {metrics.total_conversations} conversas de forma autônoma,
                economizando aprox. {metrics.hours_saved} horas de atendimento manual.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Tabs defaultValue="test" className="space-y-4">
        <TabsList>
          <TabsTrigger value="test">Testar IA</TabsTrigger>
          <TabsTrigger value="content">Gerar Conteúdo</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        {/* Test tab */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simular conversa com a Ana</CardTitle>
              <CardDescription>Teste como a IA responderia a um cliente real</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Quanto custa a ração Golden para cão adulto?"
                  value={testMessage}
                  onChange={e => setTestMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTest()}
                  className="flex-1"
                />
                <Button onClick={handleTest} disabled={testLoading || !testMessage.trim()}>
                  {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>

              {testResponse && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium">Ana respondeu</span>
                      <Badge className="text-xs" variant="outline">{testResponse.action}</Badge>
                    </div>
                    <p className="text-sm">{testResponse.response || 'Sem resposta'}</p>
                  </div>
                  {testResponse.reason && (
                    <p className="text-xs text-muted-foreground">
                      Motivo de transferência: <strong>{testResponse.reason}</strong>
                    </p>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content generation tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IA Social Media</CardTitle>
              <CardDescription>Gere posts, legendas e hashtags para o Instagram</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Tipo de conteúdo</Label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post">Post feed</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="reel_caption">Reel (legenda)</SelectItem>
                      <SelectItem value="promotion">Promoção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Assunto (opcional)</Label>
                  <Input
                    placeholder="Ex: vacinação de cães, plantio de milho..."
                    value={contentTopic}
                    onChange={e => setContentTopic(e.target.value)}
                  />
                </div>
              </div>

              <Button onClick={handleGenerateContent} disabled={contentLoading} className="gap-2">
                {contentLoading
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />Gerando...</>
                  : <><Sparkles className="w-4 h-4" />Gerar com IA</>
                }
              </Button>

              {generatedContent && !generatedContent.error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="space-y-1">
                    <Label>Legenda</Label>
                    <Textarea value={generatedContent.caption} rows={6} readOnly className="resize-none text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label>Hashtags</Label>
                    <div className="flex flex-wrap gap-1">
                      {(generatedContent.hashtags || []).map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          #{tag.replace(/^#/, '')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {generatedContent.call_to_action && (
                    <div className="space-y-1">
                      <Label>Call to Action</Label>
                      <p className="text-sm bg-muted rounded p-2">{generatedContent.call_to_action}</p>
                    </div>
                  )}
                  {generatedContent.melhor_horario && (
                    <p className="text-xs text-muted-foreground">
                      📅 Melhor horário para postar: <strong>{generatedContent.melhor_horario}</strong>
                    </p>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações da Persona</CardTitle>
              <CardDescription>Personalize como a Ana se comporta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Nome da atendente virtual</Label>
                <Input defaultValue="Ana" />
              </div>
              <div className="space-y-1">
                <Label>Saudação inicial</Label>
                <Textarea
                  defaultValue="Olá! Sou a Ana da Agro Raiz. Como posso te ajudar hoje? 😊"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Mensagem fora do horário</Label>
                <Textarea
                  defaultValue="Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve! 🌱"
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">IA ativa</p>
                  <p className="text-xs text-muted-foreground">Responder automaticamente mensagens</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button className="w-full gap-2">
                <Settings className="w-4 h-4" />
                Salvar configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
