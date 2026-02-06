#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Use pv or character-at-a-time to stdout for real typing effect
type_it() {
  local text="$1"
  local i
  for ((i=0; i<${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep 0.04
  done
  printf '\n'
}

clear
sleep 0.5
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
sleep 0.1
echo -e "${BLUE}  📋 FormBridge — Mixed-mode forms for AI agents + humans${NC}"
sleep 0.1
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
sleep 2

echo
echo -e "${GREEN}# An AI agent is onboarding a new customer...${NC}"
sleep 0.5
echo -e "${DIM}# It has the CRM data, but needs a human for the rest.${NC}"
sleep 2

echo
echo -e "${BOLD}🤖 Agent${NC} ${DIM}(via MCP tool: formbridge_submit)${NC}"
sleep 0.5
type_it '   "I have Acme Corps details from the CRM.'
type_it '    Let me fill what I know and send the rest to a human."'
sleep 2

echo
echo -e "${DIM}─── Agent calls formbridge_submit MCP tool ───${NC}"
sleep 0.5
echo -e "${YELLOW}  Tool: formbridge_submit${NC}"
sleep 0.3
echo -e "${YELLOW}  Args: {${NC}"
sleep 0.2
echo -e "${YELLOW}    \"intakeId\": \"customer-onboarding\",${NC}"
sleep 0.2
echo -e "${YELLOW}    \"fields\": {${NC}"
sleep 0.2
echo -e "${YELLOW}      \"company\":  \"Acme Corp\",${NC}"
sleep 0.2
echo -e "${YELLOW}      \"email\":    \"cto@acme.com\",${NC}"
sleep 0.2
echo -e "${YELLOW}      \"plan\":     \"enterprise\",${NC}"
sleep 0.2
echo -e "${YELLOW}      \"industry\": \"SaaS\"${NC}"
sleep 0.2
echo -e "${YELLOW}    }${NC}"
sleep 0.1
echo -e "${YELLOW}  }${NC}"
sleep 2

echo
echo -e "${DIM}─── FormBridge response ───${NC}"
sleep 0.5
echo -e "${YELLOW}  {${NC}"
sleep 0.2
echo -e "${YELLOW}    \"status\":    \"partial\",${NC}"
sleep 0.2
echo -e "${YELLOW}    \"filled\":    [\"company\", \"email\", \"plan\", \"industry\"],${NC}"
sleep 0.2
echo -e "${YELLOW}    \"missing\":   [\"notes\", \"signature\", \"billing_address\"],${NC}"
sleep 0.2
echo -e "${YELLOW}    \"resumeUrl\": \"https://forms.acme.dev/resume/rt_k8f2m9\"${NC}"
sleep 0.2
echo -e "${YELLOW}  }${NC}"
sleep 2

echo
echo -e "${BOLD}🤖 Agent${NC}"
sleep 0.3
type_it '   "Done - I filled 4/7 fields. Sending the resume link'
type_it '    to the account manager to complete the rest."'
sleep 2

echo
echo -e "${GREEN}# Human opens the resume link...${NC}"
sleep 1
echo
echo -e "   ${CYAN}┌──────────────────────────────────────────┐${NC}"
sleep 0.15
echo -e "   ${CYAN}│  ${BOLD}Customer Onboarding${NC}${CYAN}                     │${NC}"
sleep 0.15
echo -e "   ${CYAN}│                                          │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Company:  Acme Corp            🤖 ${DIM}agent${NC}${CYAN} │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Email:    cto@acme.com          🤖 ${DIM}agent${NC}${CYAN} │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Plan:     Enterprise            🤖 ${DIM}agent${NC}${CYAN} │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Industry: SaaS                  🤖 ${DIM}agent${NC}${CYAN} │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Notes:    [________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Signature:[________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
sleep 0.15
echo -e "   ${CYAN}│  Billing:  [________________]   ✏️  ${DIM}you${NC}${CYAN}   │${NC}"
sleep 0.15
echo -e "   ${CYAN}│                                          │${NC}"
sleep 0.15
echo -e "   ${CYAN}│           [ Complete & Submit ]           │${NC}"
sleep 0.15
echo -e "   ${CYAN}└──────────────────────────────────────────┘${NC}"
sleep 3

echo
echo -e "${GREEN}# Every field tracked — who filled what${NC}"
sleep 1
echo -e "${YELLOW}  \"company\":  { \"value\": \"Acme Corp\",       \"source\": \"ai-agent\" }${NC}"
sleep 0.4
echo -e "${YELLOW}  \"email\":    { \"value\": \"cto@acme.com\",    \"source\": \"ai-agent\" }${NC}"
sleep 0.4
echo -e "${YELLOW}  \"notes\":    { \"value\": \"Priority acct\",   \"source\": \"human\"    }${NC}"
sleep 0.4
echo -e "${YELLOW}  \"signature\":{ \"value\": \"J. Smith\",        \"source\": \"human\"    }${NC}"
sleep 2

echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
sleep 0.1
echo -e "${BLUE}  AI agents fill what they know. Humans finish the rest.${NC}"
sleep 0.1
echo -e "${BLUE}  Full audit trail. Field-level attribution. MCP-native.${NC}"
sleep 0.1
echo -e "${BLUE}  → github.com/amitpaz1/formbridge${NC}"
sleep 0.1
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
sleep 3
