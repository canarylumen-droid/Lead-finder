import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { type LogEntry } from "@shared/schema";
import { useLeads, useScrapeLeads, useStats, getExportUrl, useJobWebSocket } from "@/hooks/use-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LeadCard } from "@/components/LeadCard";
import { StatsCard } from "@/components/StatsCard";
import { Loader2, Search, Download, Target, Users, BarChart3, Sparkles, Terminal, Copy, CheckCircle, XCircle, AlertCircle, Info, ChevronLeft, ChevronRight, ArrowRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";

interface LeadSuggestion {
  category: string;
  keywords: string[];
  description: string;
  buyerProfile: string;
  estimatedBudget: string;
}

interface OfferingAnalysis {
  summary: string;
  targetAudience: string;
  suggestedLeadTypes: LeadSuggestion[];
  searchKeywords: string[];
}

function LogLine({ log }: { log: LogEntry }) {
  const getIcon = () => {
    switch (log.level) {
      case 'success': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-500" />;
      case 'warn': return <AlertCircle className="w-3 h-3 text-amber-500" />;
      default: return <Info className="w-3 h-3 text-blue-500" />;
    }
  };

  const getColor = () => {
    switch (log.level) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warn': return 'text-amber-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="flex items-start gap-2 text-xs font-mono py-0.5">
      <span className="text-gray-500 shrink-0">
        {log.workerId !== undefined ? `[W${log.workerId}]` : '[SYS]'}
      </span>
      {getIcon()}
      <span className={getColor()}>{log.message}</span>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'all' | 'qualified' | 'unqualified'>("all");
  const [page, setPage] = useState(1);
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [step, setStep] = useState<'input' | 'suggestions' | 'scraping'>('input');
  const [analysis, setAnalysis] = useState<OfferingAnalysis | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [customKeywords, setCustomKeywords] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [offering, setOffering] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'linkedin' | 'both'>('both');
  const [quantity, setQuantity] = useState(50);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  const { data: leadsData, isLoading: isLoadingLeads } = useLeads(page, 20, activeTab);
  const { data: stats, isLoading: isLoadingStats } = useStats();
  const scrapeMutation = useScrapeLeads();
  const { logs, stats: jobStats, isComplete } = useJobWebSocket(currentJobId);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const analyzeOffering = async () => {
    if (!offering.trim()) {
      toast({ title: "Please describe your offering", variant: "destructive" });
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-offering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offering }),
      });
      
      if (!res.ok) throw new Error('Analysis failed');
      
      const data = await res.json();
      setAnalysis(data);
      setSelectedKeywords(data.searchKeywords || []);
      setStep('suggestions');
    } catch (err) {
      toast({ title: "Failed to analyze offering", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => 
      prev.includes(keyword) 
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
  };

  const startScraping = () => {
    const allKeywords = [
      ...selectedKeywords,
      ...customKeywords.split(',').map(k => k.trim()).filter(k => k),
    ];
    
    if (allKeywords.length === 0) {
      toast({ title: "Please select at least one keyword", variant: "destructive" });
      return;
    }

    scrapeMutation.mutate(
      { platform, query: allKeywords.join(', '), quantity, offering },
      {
        onSuccess: (response) => {
          if (response.jobId) {
            setCurrentJobId(parseInt(response.jobId));
            setStep('scraping');
            toast({ title: "Scraping Started", description: response.message });
          }
        },
        onError: (error) => {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        },
      }
    );
  };

  const resetForm = () => {
    setStep('input');
    setAnalysis(null);
    setSelectedKeywords([]);
    setCustomKeywords('');
    setCurrentJobId(null);
  };

  const copyLogs = () => {
    const logText = logs.map(l => `[${l.workerId !== undefined ? `W${l.workerId}` : 'SYS'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText);
    toast({ title: "Logs copied to clipboard" });
  };

  const leads = leadsData?.leads || [];
  const totalPages = leadsData?.totalPages || 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-20">
      {/* Header */}
      <div className="bg-background border-b border-border/40 sticky top-0 z-10 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <Target className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold font-display bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-600">
                LeadGen Pro
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Button variant="outline" size="sm" className="hidden sm:flex" asChild>
                <a href={getExportUrl()} target="_blank" rel="noopener noreferrer" data-testid="link-export">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Total Leads"
            value={isLoadingStats ? "..." : (stats?.total ?? 0)}
            description="Real leads scraped"
            icon={Users}
            trend="neutral"
          />
          <StatsCard
            title="Qualified Leads"
            value={isLoadingStats ? "..." : (stats?.qualified ?? 0)}
            description="High-intent buyers"
            icon={Target}
            trend="up"
          />
          <StatsCard
            title="Avg. Score"
            value={isLoadingStats ? "..." : `${stats?.averageScore ?? 0}%`}
            description="AI qualification score"
            icon={BarChart3}
            trend="up"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Search/Config Panel */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Step 1: Describe Offering */}
            {step === 'input' && (
              <Card className="border-border/50 shadow-lg overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-violet-500 to-primary opacity-20" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Step 1: Your Offering
                  </CardTitle>
                  <CardDescription>
                    Describe what you sell. AI will find who's most likely to buy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea 
                    placeholder="e.g. We provide SEO services for dental clinics to help them get more patients from Google..."
                    className="min-h-[120px] bg-muted/30"
                    value={offering}
                    onChange={(e) => setOffering(e.target.value)}
                    data-testid="input-offering"
                  />
                  <Button 
                    className="w-full"
                    onClick={analyzeOffering}
                    disabled={isAnalyzing}
                    data-testid="button-analyze"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Analyze & Find Buyers
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Review Suggestions */}
            {step === 'suggestions' && analysis && (
              <Card className="border-border/50 shadow-lg overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Step 2: Select Keywords
                  </CardTitle>
                  <CardDescription>
                    {analysis.targetAudience}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Suggested lead types:</p>
                    {analysis.suggestedLeadTypes.map((lead, i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="font-medium text-sm">{lead.category}</div>
                        <p className="text-xs text-muted-foreground">{lead.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {lead.keywords.map((kw, j) => (
                            <Badge 
                              key={j}
                              variant={selectedKeywords.includes(kw) ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleKeyword(kw)}
                              data-testid={`badge-keyword-${i}-${j}`}
                            >
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Add custom keywords:</label>
                    <Input 
                      placeholder="e.g. dentist owner, clinic founder"
                      value={customKeywords}
                      onChange={(e) => setCustomKeywords(e.target.value)}
                      data-testid="input-custom-keywords"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Platform</label>
                      <select 
                        className="w-full mt-1 p-2 rounded-md bg-muted/50 border border-border text-sm"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value as any)}
                        data-testid="select-platform"
                      >
                        <option value="both">Both</option>
                        <option value="instagram">Instagram</option>
                        <option value="linkedin">LinkedIn</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Quantity</label>
                      <select 
                        className="w-full mt-1 p-2 rounded-md bg-muted/50 border border-border text-sm"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value))}
                        data-testid="select-quantity"
                      >
                        <option value="50">50 leads</option>
                        <option value="100">100 leads</option>
                        <option value="250">250 leads</option>
                        <option value="500">500 leads</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resetForm} data-testid="button-back">
                      Back
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={startScraping}
                      disabled={scrapeMutation.isPending}
                      data-testid="button-start-scraping"
                    >
                      {scrapeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="mr-2 h-4 w-4" />
                      )}
                      Start Scraping
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Scraping Progress */}
            {step === 'scraping' && (
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">Live Scraping</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {jobStats && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-500">{jobStats.processedCount} found</span>
                        <span className="text-blue-500">{jobStats.qualifiedCount} qualified</span>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLogs} data-testid="button-copy-logs">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </CardHeader>
                <div 
                  ref={terminalRef}
                  className="bg-gray-900 dark:bg-gray-950 p-3 h-64 overflow-y-auto"
                >
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-xs font-mono">Connecting to scraper...</div>
                  ) : (
                    logs.map((log, i) => <LogLine key={i} log={log} />)
                  )}
                  {isComplete && (
                    <div className="text-green-400 text-xs font-mono mt-2 pt-2 border-t border-gray-700">
                      Scraping completed. Check your leads below.
                    </div>
                  )}
                </div>
                {isComplete && (
                  <div className="p-3 border-t">
                    <Button variant="outline" size="sm" onClick={resetForm} data-testid="button-new-search">
                      Start New Search
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-8">
            <div className="flex flex-col h-full space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-bold font-display">Your Leads</h2>
                <Tabs defaultValue="all" value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(1); }} className="w-auto">
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="all" data-testid="tab-all">All ({leadsData?.total || 0})</TabsTrigger>
                    <TabsTrigger value="qualified" data-testid="tab-qualified">Qualified</TabsTrigger>
                    <TabsTrigger value="unqualified" data-testid="tab-unqualified">Low Match</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isLoadingLeads ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                  <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary/50" />
                  <p>Loading leads...</p>
                </div>
              ) : !leads?.length ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-muted/20 rounded-xl border border-dashed border-border p-12 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Search className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">No leads yet</h3>
                  <p className="text-muted-foreground max-w-sm mt-2">
                    Describe your offering to start finding real leads from Instagram and LinkedIn.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
                    <AnimatePresence mode="popLayout">
                      {leads.map((lead, index) => (
                        <LeadCard key={lead.id} lead={lead} index={index} />
                      ))}
                    </AnimatePresence>
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-4">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
