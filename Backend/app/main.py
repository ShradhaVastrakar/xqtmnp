from fastapi import FastAPI

app = FastAPI(title="Backend API")

@app.get("/")
def read_root():
    return {"message": "Backend is running"}
