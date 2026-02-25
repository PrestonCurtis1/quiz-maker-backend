# Quiz Creator Backend

A minimal, high-performance Node.js and Express backend for creating, editing, and sharing quizzes. Designed for simplicity, privacy, and ease of deployment.

## ✨ Features

* **Zero-API Dependency:** Generate starter quizzes locally without needing third-party AI API keys.
* **PDF to Quiz:** Built-in support for generating draft quizzes from study guide PDFs.
* **Social Ready:** Built-in support for Open Graph tags, making your quizzes look great when shared on Discord, Twitter, or Slack.
* **Deployment Friendly:** Native support for HTTPS and custom base URL configuration.

---

## 🚀 Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) (v16+ recommended)
* `npm`

### Installation

1. Clone the repository:
```bash
git clone https://github.com/PrestonCurtis1/quiz-maker-backend.git
cd quiz-maker-backend

```


2. Install dependencies:
```bash
npm install

```


3. Start the server:
```bash
npm start

```


*The server will run on `http://0.0.0.0:80` by default.*

---

## ⚙️ Configuration

### Environment Variables

You can customize the server behavior using the following environment variables:

| Variable | Description |
| --- | --- |
| `SSL_KEY_PATH` | Path to your SSL private key file. |
| `SSL_CERT_PATH` | Path to your SSL certificate file. |
| `HTTPS_PORT` | Port for HTTPS (default: 443). |
| `HTTP_PORT` | Port for HTTP (default: 80). |
| `PUBLIC_BASE_URL` | Your domain (e.g., `https://myquiz.com`) for correct social preview links. |
| `ENABLE_HTTP_REDIRECT` | Set to `false` to disable automatic HTTP to HTTPS redirect. |

### HTTPS Setup

To run with SSL/TLS, define the paths to your certificate files before starting the server:

```bash
set SSL_KEY_PATH=C:\path\to\key.pem
set SSL_CERT_PATH=C:\path\to\cert.pem
npm start

```

---

## 🔗 Sharing Quizzes

Share your quizzes directly via URL:
`https://your-domain.com/share/<quizId>`

This route automatically handles Open Graph metadata to ensure your quizzes look professional when embedded in chat apps, then redirects users to the `take.html` interface.

---

## 🛡️ Security Best Practices

* **Keep Secrets Private:** Never commit your `.pem` files or any `.env` files containing sensitive data to version control. Ensure they are listed in your `.gitignore`.
* **Sanitization:** Always sanitize user-provided inputs if you expand the quiz generation logic to prevent injection vulnerabilities.
* 
