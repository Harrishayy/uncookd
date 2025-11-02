from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class RequestBody(BaseModel):
    message: str

@app.get("/")
async def root():
    return {"status":"success"}

@app.post("/api/generate-response")
async def generate_response(body:RequestBody):
    user_message = body.message

    transcript = ""

    audio = None

    return {"status":"success", "transcript":transcript, "audio":audio}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)