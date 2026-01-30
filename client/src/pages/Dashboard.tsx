import { useState, useRef, useEffect } from "react";
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
import { Loader2, Search, Download, Target, Users, BarChart3, Sparkles, Terminal, Copy, CheckCircle, XCircle, AlertCircle, Info, ChevronLeft, ChevronRight, ArrowRight, Play, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NicheSuggestion {
  niche: string;
  reasoning: string;
  decisionMaker: string;
  budgetRange: string;
}

interface OfferingAnalysis {
  summary: string;
  targetDescription: string;
  niches: NicheSuggestion[];
}

interface KeywordResult {
  keywords: string[];
  nicheBreakdown: { niche: string; keywords: string[] }[];
}

function LogLine({ log }: { log: LogEntry }) {
  const getIcon = () => {
    switch (log.level) {
      case 'success': return <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-500 shrink-0" />;
      case 'warn': return <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />;
      default: return <Info className="w-3 h-3 text-blue-500 shrink-0" />;
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
      <span className="text-gray-500 shrink-0 w-10">
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
  
  // Flow state - 4 steps: input → niches → keywords → scraping
  const [step, setStep] = useState<'input' | 'niches' | 'keywords' | 'scraping'>('input');
  const [analysis, setAnalysis] = useState<OfferingAnalysis | null>(null);
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [keywordResult, setKeywordResult] = useState<KeywordResult | null>(null);
  const [confirmedKeywords, setConfirmedKeywords] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [offering, setOffering] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'linkedin' | 'both'>('both');
  const [quantity, setQuantity] = useState(100);
  
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

  // Step 1: Analyze offering to find ideal buyer niches
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
      
      const data = await res.json() as OfferingAnalysis;
      setAnalysis(data);
      setSelectedNiches(data.niches.map(n => n.niche));
      setStep('niches');
    } catch (err) {
      toast({ title: "Failed to analyze offering", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Toggle niche selection
  const toggleNiche = (niche: string) => {
    setSelectedNiches(prev => 
      prev.includes(niche) 
        ? prev.filter(n => n !== niche)
        : [...prev, niche]
    );
  };

  // Step 2: Generate keywords for selected niches
  const generateKeywords = async () => {
    if (selectedNiches.length === 0) {
      toast({ title: "Please select at least one niche", variant: "destructive" });
      return;
    }
    
    setIsGeneratingKeywords(true);
    try {
      const res = await fetch('/api/generate-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offering, niches: selectedNiches }),
      });
      
      if (!res.ok) throw new Error('Keyword generation failed');
      
      const data = await res.json() as KeywordResult;
      setKeywordResult(data);
      setConfirmedKeywords(data.keywords);
      setStep('keywords');
    } catch (err) {
      toast({ title: "Failed to generate keywords", variant: "destructive" });
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  // When user types custom keywords directly
  const handleCustomKeywords = () => {
    if (!customInput.trim()) {
      toast({ title: "Please enter keywords", variant: "destructive" });
      return;
    }
    
    const userKeywords = customInput.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    if (userKeywords.length === 0) {
      toast({ title: "No valid keywords found", variant: "destructive" });
      return;
    }
    
    setConfirmedKeywords(userKeywords);
    setKeywordResult({ keywords: userKeywords, nicheBreakdown: [] });
    setStep('keywords');
  };

  // Remove a keyword from the confirmed list
  const removeKeyword = (keyword: string) => {
    setConfirmedKeywords(prev => prev.filter(k => k !== keyword));
  };

  // Step 3: Start scraping with confirmed keywords
  const startScraping = () => {
    if (confirmedKeywords.length === 0) {
      toast({ title: "No keywords selected", variant: "destructive" });
      return;
    }

    scrapeMutation.mutate(
      { 
        platform, 
        query: confirmedKeywords.join(', '), 
        quantity, 
        offering 
      },
      {
        onSuccess: (response) => {
          if (response.jobId) {
            setCurrentJobId(parseInt(response.jobId));
            setStep('scraping');
            toast({ title: "Scraping Started", description: `Finding ${quantity} leads...` });
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
    setSelectedNiches([]);
    setKeywordResult(null);
    setConfirmedKeywords([]);
    setCustomInput('');
    setCurrentJobId(null);
  };

  const goBack = () => {
    if (step === 'niches') setStep('input');
    else if (step === 'keywords') setStep('niches');
  };

  const copyLogs = () => {
    const logText = logs.map(l => `[${l.workerId !== undefined ? `W${l.workerId}` : 'SYS'}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText);
    toast({ title: "Logs copied" });
  };

  const leads = leadsData?.leads || [];
  const totalPages = leadsData?.totalPages || 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-20">
      {/* Header */}
      <div className="bg-background border-b border-border/40 sticky top-0 z-10 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary">
                <Target className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-600">
                LeadGen Pro
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button variant="outline" size="sm" asChild>
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
        
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Total Leads"
            value={isLoadingStats ? "..." : (stats?.total ?? 0)}
            description="Real leads scraped"
            icon={Users}
            trend="neutral"
          />
          <StatsCard
            title="Qualified"
            value={isLoadingStats ? "..." : (stats?.qualified ?? 0)}
            description="High-intent buyers"
            icon={Target}
            trend="up"
          />
          <StatsCard
            title="Avg. Score"
            value={isLoadingStats ? "..." : `${stats?.averageScore ?? 0}%`}
            description="AI qualification"
            icon={BarChart3}
            trend="up"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Panel - Search Flow */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Step 1: Describe Offering */}
            {step === 'input' && (
              <Card className="border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Step 1: Describe Your Offering
                  </CardTitle>
                  <CardDescription>
                    Tell us what you sell. AI will find businesses that NEED your service.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea 
                    placeholder="e.g. I offer website development for small businesses. I help them get online and attract more customers..."
                    className="min-h-[120px] bg-muted/30"
                    value={offering}
                    onChange={(e) => setOffering(e.target.value)}
                    data-testid="input-offering"
                  />
                  
                  <Button 
                    className="w-full"
                    onClick={analyzeOffering}
                    disabled={isAnalyzing || !offering.trim()}
                    data-testid="button-analyze"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Analyze & Find Buyers
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or enter keywords directly</span>
                    </div>
                  </div>
                  
                  <Input 
                    placeholder="e.g. restaurant owner, dental clinic founder, gym owner"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    data-testid="input-custom-keywords"
                  />
                  
                  {customInput.trim() && (
                    <Button 
                      variant="outline"
                      className="w-full"
                      onClick={handleCustomKeywords}
                      data-testid="button-use-custom"
                    >
                      Use My Keywords
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Select Niches */}
            {step === 'niches' && analysis && (
              <Card className="border-border/50 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Step 2: Select Target Niches
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {analysis.summary}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="text-sm font-medium mb-2">Your ideal buyers:</div>
                    <p className="text-xs text-muted-foreground">{analysis.targetDescription}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Click to select/deselect niches:</div>
                    {analysis.niches.map((n, i) => (
                      <div 
                        key={i} 
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedNiches.includes(n.niche) 
                            ? 'bg-primary/10 border-primary/40' 
                            : 'bg-muted/30 border-transparent hover:bg-muted/50'
                        }`}
                        onClick={() => toggleNiche(n.niche)}
                        data-testid={`niche-${i}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{n.niche}</div>
                          {selectedNiches.includes(n.niche) && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{n.reasoning}</div>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">{n.decisionMaker}</Badge>
                          <Badge variant="outline" className="text-xs">{n.budgetRange}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={goBack}>
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={generateKeywords}
                      disabled={selectedNiches.length === 0 || isGeneratingKeywords}
                      data-testid="button-generate-keywords"
                    >
                      {isGeneratingKeywords ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generate Keywords ({selectedNiches.length} niches)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Confirm Keywords */}
            {step === 'keywords' && keywordResult && (
              <Card className="border-border/50 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="w-5 h-5 text-primary" />
                    Step 3: Confirm Search Keywords
                  </CardTitle>
                  <CardDescription>
                    These are the exact keywords we'll use to find your ideal buyers. Click to remove any.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {keywordResult.nicheBreakdown.length > 0 && (
                    <div className="space-y-3">
                      {keywordResult.nicheBreakdown.map((nb, i) => (
                        <div key={i} className="p-2 bg-muted/30 rounded-lg">
                          <div className="text-xs font-medium text-muted-foreground mb-1">{nb.niche}</div>
                          <div className="flex flex-wrap gap-1">
                            {nb.keywords.map((kw, j) => (
                              <Badge 
                                key={j} 
                                variant={confirmedKeywords.includes(kw) ? "default" : "secondary"}
                                className="text-xs cursor-pointer"
                                onClick={() => removeKeyword(kw)}
                              >
                                {kw}
                                {confirmedKeywords.includes(kw) && (
                                  <X className="w-3 h-3 ml-1" />
                                )}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {keywordResult.nicheBreakdown.length === 0 && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="text-sm font-medium mb-2">Your keywords:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {confirmedKeywords.map((kw, i) => (
                          <Badge 
                            key={i} 
                            variant="default" 
                            className="text-xs cursor-pointer"
                            onClick={() => removeKeyword(kw)}
                          >
                            {kw}
                            <X className="w-3 h-3 ml-1" />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                    {confirmedKeywords.length} keywords selected
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
                        <option value="1000">1000 leads</option>
                        <option value="2000">2000 leads</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={goBack}>
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <Button 
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={startScraping}
                      disabled={confirmedKeywords.length === 0 || scrapeMutation.isPending}
                      data-testid="button-start-scraping"
                    >
                      {scrapeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Start Scraping - Get {quantity} Leads
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scraping Progress */}
            {step === 'scraping' && (
              <Card className="border-border/50 overflow-hidden">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2 border-b">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">Live Scraping</span>
                    {!isComplete && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyLogs} data-testid="button-copy-logs">
                    <Copy className="w-3 h-3" />
                  </Button>
                </CardHeader>
                
                {jobStats && (
                  <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between text-xs">
                    <span><strong>{jobStats.processedCount}</strong> found</span>
                    <span><strong>{jobStats.qualifiedCount}</strong> qualified</span>
                    <span><strong>{jobStats.duplicatesSkipped}</strong> dupes</span>
                    <span><strong>{jobStats.activeWorkers}</strong> workers</span>
                  </div>
                )}
                
                <div 
                  ref={terminalRef}
                  className="bg-gray-900 dark:bg-gray-950 p-3 h-72 overflow-y-auto font-mono"
                >
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-xs">Initializing workers...</div>
                  ) : (
                    logs.map((log, i) => <LogLine key={i} log={log} />)
                  )}
                  {isComplete && (
                    <div className="text-green-400 text-xs mt-2 pt-2 border-t border-gray-700">
                      Scraping completed. {jobStats?.processedCount || 0} leads ready.
                    </div>
                  )}
                </div>
                
                {isComplete && (
                  <div className="p-3 border-t flex gap-2">
                    <Button variant="outline" size="sm" onClick={resetForm}>
                      New Search
                    </Button>
                    <Button size="sm" asChild>
                      <a href={getExportUrl()} target="_blank" rel="noopener noreferrer">
                        <Download className="w-4 h-4 mr-1" />
                        Download CSV
                      </a>
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right Panel - Leads */}
          <div className="lg:col-span-8">
            <div className="flex flex-col h-full space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="text-2xl font-bold">Your Leads</h2>
                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(1); }}>
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="all" data-testid="tab-all">All ({leadsData?.total || 0})</TabsTrigger>
                    <TabsTrigger value="qualified" data-testid="tab-qualified">Qualified</TabsTrigger>
                    <TabsTrigger value="unqualified" data-testid="tab-unqualified">Low Match</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isLoadingLeads ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                  <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary/50" />
                  <p className="text-muted-foreground">Loading leads...</p>
                </div>
              ) : !leads?.length ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-muted/20 rounded-xl border border-dashed p-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No leads yet</h3>
                  <p className="text-muted-foreground max-w-sm mt-2">
                    Describe your offering or enter keywords to start finding real leads.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {leads.map((lead, index) => (
                      <LeadCard key={lead.id} lead={lead} index={index} />
                    ))}
                  </div>
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                        data-testid="button-next-page"
                      >
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
