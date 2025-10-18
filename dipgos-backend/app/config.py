from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    feature_contract_right_panel: bool = False
    feature_contract_schedule: bool = False
    feature_contract_right_panel_echarts: bool = False
    feature_schedule_ui: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context):
        # Backwards compatibility with previous feature flags
        if not self.feature_contract_right_panel_echarts and self.feature_contract_right_panel:
            self.feature_contract_right_panel_echarts = True
        if not self.feature_schedule_ui and self.feature_contract_schedule:
            self.feature_schedule_ui = True

settings = Settings()
