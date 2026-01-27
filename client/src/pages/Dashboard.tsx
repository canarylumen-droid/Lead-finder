import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { scrapeRequestSchema, type ScrapeRequest } from "@shared/schema";
import { useLeads, useScrapeLeads, useStats, getExportUrl, useProxyStatus } from "@/hooks/use-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadCard } from "@/components/LeadCard";
import { StatsCard } from "@/components/StatsCard";
import { Loader2, Search, Download, Target, Users, BarChart3, Sparkles, AlertTriangle, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all");
  
  const { data: leads, isLoading: isLoadingLeads } = useLeads();
  const { data: stats, isLoading: isLoadingStats } = useStats();
  const { data: proxyStatus } = useProxyStatus();
  const scrapeMutation = useScrapeLeads();

  const form = useForm<ScrapeRequest>({
    resolver: zodResolver(scrapeRequestSchema),
    defaultValues: {
      platform: "instagram",
      query: "",
      quantity: 10,
      offering: "",
    },
  });

  const onSubmit = (data: ScrapeRequest) => {
    scrapeMutation.mutate(data, {
      onSuccess: (response) => {
        if (response.error) {
          toast({
            title: "Configuration Required",
            description: response.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Scraping Complete",
            description: response.message,
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const filteredLeads = leads?.filter(lead => {
    if (activeTab === "qualified") return lead.isQualified;
    if (activeTab === "unqualified") return !lead.isQualified;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 pb-20">
      {/* Hero Header */}
      <div className="bg-white border-b border-border/40 sticky top-0 z-10 backdrop-blur-md bg-white/80 supports-[backdrop-filter]:bg-white/60">
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
              <Button variant="outline" size="sm" className="hidden sm:flex" asChild>
                <a href={getExportUrl()} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Proxy Status Banner */}
        {proxyStatus && !proxyStatus.configured && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="flex items-start gap-4 py-4">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">Proxy Configuration Required</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Real scraping requires rotating proxies to bypass rate limits. Set environment variables:
                </p>
                <code className="text-xs bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded mt-2 inline-block font-mono">
                  PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD
                </code>
              </div>
            </CardContent>
          </Card>
        )}

        {proxyStatus?.configured && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
            <CardContent className="flex items-center gap-4 py-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <span className="font-medium text-green-800 dark:text-green-200">Proxy Connected</span>
                <span className="text-sm text-green-600 dark:text-green-400 ml-2">Ready for real-time scraping</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Total Leads"
            value={isLoadingStats ? "..." : (stats?.total ?? 0)}
            description="Leads found across platforms"
            icon={Users}
            trend="neutral"
          />
          <StatsCard
            title="Qualified Leads"
            value={isLoadingStats ? "..." : (stats?.qualified ?? 0)}
            description="High relevance matches"
            icon={Target}
            trend="up"
          />
          <StatsCard
            title="Avg. Relevance"
            value={isLoadingStats ? "..." : `${stats?.averageScore ?? 0}%`}
            description="Overall match quality"
            icon={BarChart3}
            trend="up"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Search/Config Panel */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-violet-500 to-primary opacity-20" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  New Search
                </CardTitle>
                <CardDescription>
                  Define your target audience and we'll find the best leads.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    
                    <FormField
                      control={form.control}
                      name="offering"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Offering</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="e.g. We provide SEO services for dental clinics..." 
                              className="resize-none min-h-[80px] bg-muted/30 focus:bg-white transition-colors"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="platform"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Platform</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-muted/30">
                                  <SelectValue placeholder="Select platform" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="instagram">Instagram</SelectItem>
                                <SelectItem value="linkedin">LinkedIn</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <Select 
                              onValueChange={(val) => field.onChange(parseInt(val))} 
                              defaultValue={String(field.value)}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-muted/30">
                                  <SelectValue placeholder="Amount" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="10">10 Leads</SelectItem>
                                <SelectItem value="50">50 Leads</SelectItem>
                                <SelectItem value="100">100 Leads</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="query"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Search Query</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input 
                                placeholder="e.g. Dentists in New York" 
                                className="pl-9 bg-muted/30 focus:bg-white transition-colors"
                                {...field} 
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 shadow-lg shadow-primary/25"
                      disabled={scrapeMutation.isPending}
                    >
                      {scrapeMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Finding Leads...
                        </>
                      ) : (
                        "Start Hunting"
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-8">
            <div className="flex flex-col h-full space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-display">Recent Results</h2>
                <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-[400px]">
                  <TabsList className="grid w-full grid-cols-3 bg-muted/50">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="qualified">Qualified</TabsTrigger>
                    <TabsTrigger value="unqualified">Low Match</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isLoadingLeads ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                  <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary/50" />
                  <p>Fetching your leads...</p>
                </div>
              ) : !filteredLeads?.length ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] bg-muted/20 rounded-xl border border-dashed border-border p-12 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Search className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">No leads found yet</h3>
                  <p className="text-muted-foreground max-w-sm mt-2">
                    Start a new search to find potential leads matching your criteria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr">
                  <AnimatePresence mode="popLayout">
                    {filteredLeads.map((lead, index) => (
                      <LeadCard key={lead.id} lead={lead} index={index} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
