# cf_ai_gov2private

**Government-to-Private Sector Resume Transformation Tool**

An AI-powered application that helps government employees transition to private sector roles by automatically transforming their resumes, discovering relevant job opportunities, and providing intelligent career guidance.
As more government employees search for positions in industry tools like this are increasingly more helpful.
This tool is a starting point for an industry job search / resume tailoring --- please double check statistics generated as they may not be accurate. This is an MVP of this project idea; more customized tailoring and better extraction is coming soon!

## Live Demo

[Deployed Application](https://gov2private.nikosfirst.workers.dev/) - Try it out with your government resume!
[Loom Demo](https://www.loom.com/share/6dc7fe38df154aeb89ea3b2abe600483?sid=aa04fde7-03d0-41a4-91fb-947dc40800f6) - take a quick look at the flow using this video!

## Overview

This application addresses a critical need: helping government employees translate their public sector experience into compelling private sector resumes. Using advanced AI, it automatically:

- **Analyzes** government resumes and extracts key skills/experience
- **Discovers** relevant private sector job roles based on transferable skills
- **Transforms** resume bullets to use private sector language and metrics
- **Provides** intelligent chat-based editing and career guidance
- **Exports** professional PDF resumes tailored to specific roles

## Architecture

Built entirely on Cloudflare's platform, this application demonstrates modern edge computing with AI integration:

### Core Components

#### 1. **LLM Integration**
- **Model**: Llama 3.3 70B (via Cloudflare Workers AI)
- **Usage**: Resume parsing, role discovery, bullet transformation, chat assistance
- **Features**: Structured JSON output, few-shot learning, context-aware responses

#### 2. **Workflow & Coordination**
- **Backend**: Cloudflare Workers with Hono framework
- **State Management**: Durable Objects with SQLite for persistent user state
- **API Design**: RESTful endpoints with typed responses
- **Processing Pipeline**: Multi-step AI workflow for resume transformation

#### 3. **User Input via Chat**
- **Frontend**: React + TypeScript + Tailwind CSS
- **Chat Interface**: Natural language processing for resume editing
- **Voice Support**: Ready for voice input integration
- **Real-time**: WebSocket-ready architecture for live updates

#### 4. **Memory & State**
- **Durable Objects**: Per-user state management with SQLite
- **Data Persistence**: Resume runs, chat history, role selections
- **Session Management**: Anonymous user tracking via signed cookies - no login easy history!
- **History**: trail of all transformations

## Stack

### Backend
- **Cloudflare Workers**
- **Hono**
- **Durable Objects**
- **Workers AI**
- **SQLite**

### Frontend
- **React**
- **TypeScript**
- **Tailwind CSS**
- **Vite**

### AI & Processing
- **Llama 3.3 70B**
- **Structured Output**
- **Few-shot Learning**
- **Natural Language Processing**

## Usage Guide

### 1. **Upload Your Resume**
- Paste your government resume text, if you need sample texts I included some in the ./samples directory
- Add optional background context about your career goals
- The AI will parse and structure your experience
- Give it a minute

### 2. **Discover Roles**
- AI analyzes your skills and suggests relevant private sector roles
- Each role includes match score and detailed description
- Linkedin Boolean search links are generated for each role for those that want to begin applying
- Option to input a specific job description

### 3. **Select & Transform**
- Choose your target role
- AI automatically transforms your resume bullets
- Maps government skills to private sector equivalents
- Generates tailored professional summary
- This can also take a minute!

### 4. **Chat & Refine**
- Use natural language to edit your resume
- Examples:
  - "Make the first job bullets more quantifiable"
  - "Add leadership language to all experience"
  - "Simplify the jargon in my summary"
- AI understands context and applies changes intelligently
- You can also ask the chatbot for general career advice!

### 5. **Export**
- Download professional PDF resume
- Apply with confidence to private sector positions


## Key Features

### Intelligent Resume Parsing
- Extracts structured data from any resume format
- Identifies transferable skills and experience
- Handles government-specific terminology

### AI-Powered Role Discovery
- Suggests relevant private sector roles based on your background
- Provides match scores and detailed role descriptions
- Covers diverse industries and career levels

### Smart Bullet Transformation
- Converts government language to private sector terminology
- Adds quantification and metrics where appropriate
- Maintains authenticity while improving impact

### Natural Language Editing
- Chat-based interface for resume modifications
- Understands complex editing requests
- Supports multiple transformation styles (quantitative, leadership, ATS-optimized)

### Professional Export
- Clean, ATS-friendly PDF format
- Consistent formatting across all sections
- Ready for immediate job applications

## API Endpoints

### Core Workflow
- `POST /api/discover-jobs` - Analyze resume and suggest roles
- `POST /api/run/:id/select-role` - Select target role and transform resume
- `GET /api/run/:id` - Get run details and status
- `GET /api/history` - Get user's resume transformation history

### Chat & Editing
- `POST /api/chat` - Natural language resume editing
- `POST /api/run/:id/chat` - Context-aware chat for specific runs
- `POST /api/run/:id/bullets/transform` - Programmatic bullet transformation

### Export & Search
- `GET /api/run/:id/export.pdf` - Download PDF resume
- `GET /api/linkedin-search/:jobTitle` - Get LinkedIn job search links

### Utility
- `GET /api/health` - Health check endpoint
- `GET /api/ai-test` - Test AI model connectivity


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments
I used the cloudflare react+vite+hono template that can be found at [template](https://github.com/cloudflare/templates/tree/main/vite-react-template)
---
