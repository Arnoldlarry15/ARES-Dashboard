# ARES Dashboard

**A**I **R**ed-teaming & **E**valuation **S**ystem

An interactive red-teaming dashboard for AI security professionals. Generate structured, schema-compliant JSON payloads and attack strategies based on OWASP Top 10 for LLMs, MITRE ATLAS, and MITRE ATT&CK frameworks.

## Features

- 🎯 **Multi-Framework Support**: OWASP LLM Top 10, MITRE ATLAS, and MITRE ATT&CK
- 🔧 **Interactive Builder**: Step-by-step workflow for creating attack manifests
- 🤖 **AI-Powered**: Integration with Google Gemini for dynamic payload generation
- 📦 **Export Ready**: Download executable JSON manifests for testing
- 🎨 **Professional UI**: Cybersecurity-themed dark interface with smooth animations

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- (Optional) Google Gemini API key for AI-generated payloads

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Arnoldlarry15/ARES-Dashboard.git
cd ARES-Dashboard
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Set up Gemini API key:
   - Copy `.env.local` to create your environment file
   - Replace `PLACEHOLDER_API_KEY` with your actual Gemini API key:
   ```bash
   GEMINI_API_KEY=your_actual_api_key_here
   ```
   - Get your API key from: https://makersuite.google.com/app/apikey

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to the URL shown in the terminal (typically `http://localhost:5173`)

## Usage

### Without API Key (Mock Mode)
The dashboard works perfectly without an API key using realistic mock data:
- Select any framework (OWASP, MITRE ATLAS, or MITRE ATT&CK)
- Choose a tactic from the list
- Configure attack vectors
- Review and select payloads
- Export as JSON manifest

### With Gemini API Key (AI Mode)
When you add a valid Gemini API key:
- The system generates dynamic, context-aware payloads
- More diverse and sophisticated attack examples
- Tailored mitigation strategies and references

## Building Attack Manifests

1. **Select Framework**: Choose between OWASP LLM Top 10, MITRE ATLAS, or MITRE ATT&CK
2. **Pick Tactic**: Select the attack tactic you want to explore
3. **Configure Vectors**: Choose relevant attack delivery methods
4. **Select Payloads**: Pick from generated attack payloads
5. **Export**: Download your configured attack manifest as JSON

## Build for Production

```bash
npm run build
npm run preview
```

## Tech Stack

- **Frontend**: React 19, TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI**: Google Gemini API
- **Build Tool**: Vite

## Project Structure

```
├── App.tsx              # Main application component
├── constants.tsx        # Framework tactics and metadata
├── types.ts            # TypeScript type definitions
├── services/
│   └── geminiService.ts # AI integration service
├── index.tsx           # Application entry point
├── index.html          # HTML template
└── package.json        # Dependencies and scripts
```

## Security Note

This tool is designed for **authorized security testing only**. The payloads and techniques demonstrated are for educational and authorized penetration testing purposes. Always:
- Obtain proper authorization before testing
- Use in controlled environments
- Follow responsible disclosure practices
- Comply with applicable laws and regulations

## License

See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- OWASP Foundation for LLM security guidelines
- MITRE Corporation for ATLAS and ATT&CK frameworks
- Google for Gemini AI capabilities

