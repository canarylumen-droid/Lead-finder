import { forwardRef } from "react";
import { type Lead } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Instagram, Linkedin, User, Users, Mail, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

interface LeadCardProps {
  lead: Lead;
  index: number;
}

const LeadCardInner = forwardRef<HTMLDivElement, LeadCardProps>(({ lead, index }, ref) => {
  return (
    <div ref={ref}>
      <Card className="group h-full hover:shadow-lg transition-all duration-300 border-border/60 hover:border-primary/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              lead.platform === 'instagram' 
                ? 'bg-gradient-to-br from-pink-500/10 to-orange-500/10 text-pink-600' 
                : 'bg-blue-500/10 text-blue-600'
            }`}>
              {lead.platform === 'instagram' ? <Instagram size={20} /> : <Linkedin size={20} />}
            </div>
            <div>
              <h3 className="font-semibold text-lg leading-none tracking-tight">{lead.username}</h3>
              <a 
                href={lead.profileUrl || '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1 transition-colors"
                data-testid={`link-profile-${lead.id}`}
              >
                View Profile <ExternalLink size={10} />
              </a>
            </div>
          </div>
          <Badge 
            variant={lead.isQualified ? "default" : "secondary"}
            className={lead.isQualified ? "bg-green-500/15 text-green-700 hover:bg-green-500/25 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}
          >
            {lead.isQualified ? (
              <span className="flex items-center gap-1"><CheckCircle2 size={12} /> Qualified</span>
            ) : (
              <span className="flex items-center gap-1"><XCircle size={12} /> Low Match</span>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 p-2 rounded-md">
              <Users size={14} className="text-primary/70" />
              <span className="font-medium text-foreground">{lead.followerCount?.toLocaleString() ?? "N/A"}</span>
              <span className="text-xs">followers</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 p-2 rounded-md">
              <div className="text-xs font-bold text-primary/70">SCR</div>
              <span className="font-medium text-foreground">{lead.relevanceScore}%</span>
              <span className="text-xs">relevance</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User size={14} /> Bio
            </div>
            <p className="text-sm line-clamp-3 text-foreground/80 leading-relaxed min-h-[4.5em]">
              {lead.bio || "No bio available"}
            </p>
          </div>

          {lead.email && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-sm text-foreground font-medium bg-primary/5 p-2 rounded-md border border-primary/10">
                <Mail size={14} className="text-primary" />
                <span className="truncate">{lead.email}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

LeadCardInner.displayName = "LeadCardInner";

export function LeadCard({ lead, index }: LeadCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <LeadCardInner lead={lead} index={index} />
    </motion.div>
  );
}
