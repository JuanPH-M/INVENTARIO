'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Brain, Send, TrendingDown, Lightbulb, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORY_LABELS: Record<string, string> = {
  inventory: 'Inventario',
  sales: 'Ventas',
  purchases: 'Compras',
  operations: 'Operación',
  subscriptions: 'Suscripciones',
  assets: 'Activos',
};

type AiInsight = {
  type: string;
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
};

type InsightsResponse = {
  insights: AiInsight[];
  generatedAt: string;
};

type StockPrediction = {
  productId: string;
  productName: string;
  currentStock: number;
  predictedDaysUntilStockout?: number;
  recommendedReorderQty?: number;
  confidence?: number;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'default',
  medium: 'secondary',
  low: 'outline',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  stock: TrendingDown,
  sales: Lightbulb,
  operations: AlertTriangle,
};

export default function AiPage() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: insightsData, isLoading: insightsLoading } = useQuery<InsightsResponse>({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const { data } = await apiClient.get('/ai/insights');
      return data.data ?? data;
    },
  });

  const { data: predictions, isLoading: predictionsLoading } = useQuery<StockPrediction[]>({
    queryKey: ['ai-predictions-stock'],
    queryFn: async () => {
      const { data } = await apiClient.get('/ai/predictions/stock');
      return data.data ?? [];
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data } = await apiClient.post('/ai/chat', { message, conversationId });
      return data.data ?? data;
    },
    onSuccess: (res) => {
      if (res.conversationId) setConversationId(res.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.message ?? res.response ?? 'Sin respuesta' },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Lo siento, no pude procesar tu consulta. Intenta de nuevo.' },
      ]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = inputMsg.trim();
    if (!msg || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInputMsg('');
    chatMutation.mutate(msg);
  }

  const insights = insightsData?.insights ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inteligencia artificial"
        description="Pronósticos de demanda, alertas de reabastecimiento y un asistente que responde con los datos de tu negocio"
        icon={Brain}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Insights */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Insights del negocio</h3>
          {insightsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : insights.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                <Lightbulb className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No hay insights disponibles en este momento</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {insights.map((insight, idx) => {
                const Icon = CATEGORY_ICONS[insight.category] ?? Lightbulb;
                return (
                  <Card key={idx}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={PRIORITY_VARIANT[insight.priority]}>
                              {PRIORITY_LABELS[insight.priority] ?? insight.priority}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[insight.category] ?? insight.category}</span>
                          </div>
                          <p className="text-sm font-semibold">{insight.title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
                          {insight.actionUrl && (
                            <a href={insight.actionUrl} className="text-xs text-primary hover:underline mt-1 block">
                              Ver más →
                            </a>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {insightsData?.generatedAt && (
                <p className="text-xs text-muted-foreground text-right">
                  Generado: {new Date(insightsData.generatedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              )}
            </div>
          )}

          {/* Stock predictions */}
          <h3 className="text-lg font-semibold pt-2">Predicciones de stock</h3>
          {predictionsLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : !predictions || predictions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                <TrendingDown className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No hay predicciones disponibles</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Productos con riesgo de quiebre de stock</CardTitle>
                <CardDescription>Estimaciones basadas en la tendencia de ventas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {predictions.slice(0, 6).map((pred) => (
                    <div key={pred.productId} className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{pred.productName}</p>
                        <p className="text-xs text-muted-foreground">Stock actual: {pred.currentStock}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {pred.predictedDaysUntilStockout !== undefined && (
                          <Badge variant={pred.predictedDaysUntilStockout <= 7 ? 'destructive' : pred.predictedDaysUntilStockout <= 14 ? 'default' : 'secondary'}>
                            {pred.predictedDaysUntilStockout} días
                          </Badge>
                        )}
                        {pred.recommendedReorderQty !== undefined && (
                          <p className="text-xs text-muted-foreground mt-0.5">Reordenar: {pred.recommendedReorderQty}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chat */}
        <div className="flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Asistente IA</h3>
          <Card className="flex flex-col flex-1" style={{ minHeight: '520px' }}>
            <CardContent className="flex flex-col flex-1 p-0 h-full">
              <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '420px' }}>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
                    <Brain className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Pregúntame sobre tus ventas, inventario, tendencias o cualquier aspecto de tu negocio.
                    </p>
                    <div className="flex flex-col gap-1">
                      {[
                        '¿Cuáles son los productos más vendidos?',
                        '¿Qué productos están por agotarse?',
                        '¿Cómo van las ventas este mes?',
                      ].map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="text-xs text-left px-3 py-1.5 rounded-md border hover:bg-accent transition-colors"
                          onClick={() => {
                            setMessages([{ role: 'user', content: q }]);
                            chatMutation.mutate(q);
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted px-3 py-2 rounded-lg">
                      <div className="flex gap-1 items-center h-5">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t p-3">
                <form onSubmit={handleSend} className="flex gap-2">
                  <Input
                    placeholder="Escribe tu consulta..."
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    disabled={chatMutation.isPending}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!inputMsg.trim() || chatMutation.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
