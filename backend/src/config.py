from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SECRET_KEY: str = "change-this-to-a-long-random-secret-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    DATABASE_URL: str = "sqlite:///./data/service_desk.db"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    ADMIN_EMAIL: str = "admin@company.com"
    ADMIN_PASSWORD: str = "Admin@12345"
    ADMIN_FULL_NAME: str = "IT Admin"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
