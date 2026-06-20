import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { fetchWhatIfAnalysis, WhatIfResponse } from "@/services/ai.service";
import { Send, Sparkles, AlertTriangle, ShieldAlert, Cpu, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({
    meta: [
      { title: "GridMind AI Assistant — GridMind AI" },
      { name: "description", content: "Chat with the GridMind AI traffic command center agent." },
    ],
  }),
  component: AIAssistantPage,
});

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  analysis?: WhatIfResponse;
}

function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "GridMind Assistant ready. Issue command center queries to simulate congestion controls, closures, and personnel deployment (e.g., 'Close MG Road' or 'Deploy 12 officers').",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: userText,
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build a basic WhatIfRequest payload
      const response = await fetchWhatIfAnalysis({
        query: userText,
        waypoints: [
          [12.9736, 77.6074],
          [12.9716, 77.5946],
        ],
        closedRoads: [],
        variables: {
          rain: false,
          peakHour: false,
          deployedOfficers: 5,
        },
      });

      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: response.description,
        analysis: response,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      console.error(e);
      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: "Apologies, I encountered an issue querying the backend routing model. Let's try again with a deployment or closure override command.",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid-bg text-slate-900 flex flex-col h-screen overflow-hidden">
      <AppHeader />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 py-6 md:px-6 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-border panel-glass p-5 space-y-4 mb-4 shadow-inner">
          {messages.map((msg) => {
            const isAI = msg.sender === "ai";
            return (
              <div key={msg.id} className={`flex gap-3 ${isAI ? "justify-start" : "justify-end"}`}>
                {isAI && (
                  <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-glow shrink-0">
                    <Cpu className="h-4 w-4" />
                  </div>
                )}
                <div className="max-w-[85%] flex flex-col gap-2">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      isAI
                        ? "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200"
                        : "bg-indigo-600 text-white rounded-tr-none"
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Render What-If Analysis block if present */}
                  {msg.analysis && (
                    <div className="rounded-xl border border-border bg-input/20 p-4 mt-2 text-xs space-y-3 shadow-sm animate-fade-in">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>{msg.analysis.title}</span>
                        <span className="text-[10px] uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                          Rerouted
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                        <div className="p-2 rounded bg-white">
                          <p className="text-[10px] text-muted-foreground uppercase">Congestion</p>
                          <div className="flex items-center gap-1 mt-1 text-sm font-bold">
                            <span>{msg.analysis.congestionBefore}%</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-green-600">{msg.analysis.congestionAfter}%</span>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-white">
                          <p className="text-[10px] text-muted-foreground uppercase">
                            Estimated Delay
                          </p>
                          <div className="flex items-center gap-1 mt-1 text-sm font-bold">
                            <span>{msg.analysis.delayBefore}m</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="text-green-600">{msg.analysis.delayAfter}m</span>
                          </div>
                        </div>
                      </div>

                      {msg.analysis.recommendations && msg.analysis.recommendations.length > 0 && (
                        <div className="pt-2">
                          <p className="font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> AI Recommendations
                          </p>
                          <div className="space-y-1">
                            {msg.analysis.recommendations.map((rec, idx) => (
                              <div
                                key={idx}
                                className="bg-white p-2 rounded border border-indigo-50/50"
                              >
                                <p className="font-semibold text-slate-900">{rec.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {rec.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0 animate-pulse">
                <Cpu className="h-4 w-4" />
              </div>
              <div className="flex gap-1.5 items-center">
                <span className="h-2 w-2 bg-indigo-600 rounded-full animate-bounce"></span>
                <span className="h-2 w-2 bg-indigo-600 rounded-full animate-bounce delay-75"></span>
                <span className="h-2 w-2 bg-indigo-600 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={scrollRef}></div>
        </div>

        {/* Input area */}
        <div className="flex gap-2 bg-white p-2 rounded-2xl border border-border shadow-md">
          <input
            type="text"
            placeholder="Type your command (e.g. 'Close MG Road')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 bg-transparent px-4 py-3 outline-none text-sm font-medium"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white hover:brightness-110 shadow-md transition disabled:opacity-50 disabled:hover:brightness-100"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
