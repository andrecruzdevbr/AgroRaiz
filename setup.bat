@echo off
echo === AgroRaiz Setup ===
echo.
echo 1. Installing frontend dependencies...
cd frontend
call pnpm install --ignore-scripts
echo.
echo 2. Building frontend...
call pnpm build
echo.
echo ✅ Frontend OK!
echo.
echo 3. Installing backend dependencies...
cd ..\backend
pip install -r requirements.txt
echo.
echo ✅ Setup complete!
echo.
echo To start:
echo   Backend:  cd backend ^& uvicorn app.main:app --port 8000
echo   Frontend: cd frontend ^& pnpm dev
echo   Browser:  http://localhost:3000
echo   Login:    admin@agroraiz.com.br / AgroRaiz@2024
pause
