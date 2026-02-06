#!/bin/bash
# FormBridge Demo Recording Script
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

type_slow() {
  local text="$1"
  for ((i=0; i<${#text}; i++)); do
    echo -n "${text:$i:1}"
    sleep 0.03
  done
  echo
}

pause() { sleep "${1:-1.5}"; }

clear
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  📋 FormBridge — Mixed-mode forms for AI agents + humans${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
pause 2

echo
echo -e "${GREEN}# An AI agent is onboarding a new customer...${NC}"
echo -e "${DIM}# It has the CRM data, but needs a human for the rest.${NC}"
pause 2

echo
echo -e "${BOLD}🤖 Agent${NC} ${DIM}(via MCP tool: formbridge_submit)${NC}"
echo -e "   ${CYAN}\"I have Acme Corp's details from the CRM."
echo -e "    Let me fill what I know and send the rest to a human.\"${NC}"
pause 2

echo
echo -e "${DIM}─── Agent calls formbridge_submit ───${NC}"
echo -e "${YELLOW}"
cat << 'EOF'
  Tool: formbridge_submit
  Args: {
    "intakeId": "customer-onboarding",
    "fields": {
      "company":  "Acme Corp",
      "email":    "cto@acme.com",
      "plan":     "enterprise",
      "industry": "SaaS"
    }
  }
EOF
echo -e "${NC}"
pause 2

echo -e "${DIM}─── FormBridge response ───${NC}"
echo -e "${YELLOW}"
cat << 'EOF'
  {
    "status": "partial",
    "filled":  ["company", "email", "plan", "industry"],
    "missing": ["notes", "signature", "billing_address"],
    "resumeUrl": "https://forms.acme.dev/resume/rt_k8f2m9x"
  }
EOF
echo -e "${NC}"
pause 2

echo
echo -e "${BOLD}🤖 Agent${NC}"
echo -e "   ${CYAN}\"Done — I filled 4/7 fields. Sending the link to"
echo -e "    the account manager to complete the rest.\"${NC}"
pause 2

echo
echo -e "${GREEN}# Human opens the resume link...${NC}"
pause 1
echo
echo -e "   ${CYAN}┌──────────────────────────────────────────┐${NC}"
echo -e "   ${CYAN}│  ${BOLD}Customer Onboarding${NC}${CYAN}                     │${NC}"
echo -e "   ${CYAN}│                                          │${NC}"
echo -e "   ${CYAN}│  Company:  Acme Corp            🤖 ${DIM}agent${NC}${CYAN} │${NC}"
echo -e "   ${CYAN}│  Email:    cto@acme.com          🤖 ${DIM}agent${NC}${CYAN} │${NC}"
echo -e "   ${CYAN}│  Plan:     Enterprise            🤖 ${DIM}agent${NC}${CYAN} │${NC}"
echo -e "   ${CYAN}│  Industry: SaaS                  🤖 ${DIM}agent${NC}${CYAN} │${NC}"
echo -e "   ${CYAN}│  Notes:    [________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
echo -e "   ${CYAN}│  Signature:[________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
echo -e "   ${CYAN}│  Billing:  [________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
echo -e "   ${CYAN}│                                          │${NC}"
echo -e "   ${CYAN}│           [ Complete & Submit ]           │${NC}"
echo -e "   ${CYAN}└──────────────────────────────────────────┘${NC}"
pause 3

echo
echo -e "${GREEN}# Every field tracked — who filled what${NC}"
pause 1
echo -e "${YELLOW}"
cat << 'EOF'
  "company":  { "value": "Acme Corp",      "source": "ai-agent"  }
  "email":    { "value": "cto@acme.com",   "source": "ai-agent"  }
  "notes":    { "value": "Priority account","source": "human"     }
  "signature":{ "value": "J. Smith",       "source": "human"     }
EOF
echo -e "${NC}"
pause 2

echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI agents fill what they know. Humans finish the rest.${NC}"
echo -e "${BLUE}  Full audit trail. Field-level attribution. MCP-native.${NC}"
echo -e "${BLUE}  → github.com/amitpaz1/formbridge${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
pause 3
