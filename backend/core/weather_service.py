
import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class WeatherService:
    BASE_URL = "https://api.open-meteo.com/v1/forecast"
    
    # Default: Taipei City
    DEFAULT_LAT = 25.0330
    DEFAULT_LON = 121.5654

    @staticmethod
    def get_current_weather(lat=None, lon=None):
        """
        Fetch current weather conditions and generate training advice.
        """
        if lat is None: lat = WeatherService.DEFAULT_LAT
        if lon is None: lon = WeatherService.DEFAULT_LON

        try:
            params = {
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,is_day,precipitation,rain,weather_code,wind_speed_10m",
                "daily": "uv_index_max",
                "timezone": "auto",
                "forecast_days": 1
            }

            response = requests.get(WeatherService.BASE_URL, params=params, timeout=5)
            response.raise_for_status()
            data = response.json()

            current = data.get("current", {})
            daily = data.get("daily", {})
            
            # Extract Metrics
            temp = current.get("temperature_2m", 0)
            humidity = current.get("relative_humidity_2m", 0)
            wind_speed = current.get("wind_speed_10m", 0)
            rain = current.get("rain", 0)
            is_day = current.get("is_day", 1)
            uv_index = daily.get("uv_index_max", [0])[0] if daily.get("uv_index_max") else 0
            
            # Generate Advice
            advice = WeatherService._generate_advice(temp, humidity, rain, wind_speed, uv_index)

            return {
                "location": "Taipei" if lat == WeatherService.DEFAULT_LAT else "Current Location",
                "temperature": temp,
                "humidity": humidity,
                "wind_speed": wind_speed,
                "rain": rain,
                "uv_index": uv_index,
                "is_day": bool(is_day),
                "condition_code": current.get("weather_code", 0),
                "advice": advice
            }

        except Exception as e:
            logger.error(f"Weather API Error: {e}")
            # Fallback data
            return {
                "location": "Offline Mode",
                "temperature": 24,
                "humidity": 60,
                "wind_speed": 0,
                "rain": 0,
                "uv_index": 0,
                "is_day": True,
                "condition_code": 0,
                "advice": {
                    "title": "Good Conditions",
                    "description": "Weather data unavailable. Assume standard conditions.",
                    "recommendation": "outdoor",
                    "risk_level": "low"
                }
            }

    @staticmethod
    def _generate_advice(temp, humidity, rain, wind, uv):
        """
        Generate training advice based on weather metrics.
        """
        # 1. HEAT CHECK
        if temp >= 30 or (temp >= 27 and humidity > 80):
            return {
                "title": "High Heat Risk",
                "description": "High temperature and humidity detected. Risk of heat stress.",
                "recommendation": "indoor",
                "risk_level": "high",
                "action": "Reduce pace, hydrate often, or switch to gym."
            }
        
        # 2. RAIN CHECK
        if rain > 0.5:
            return {
                "title": "Rain Detected",
                "description": "Slippery roads and reduced visibility.",
                "recommendation": "indoor",
                "risk_level": "medium",
                "action": "Perfect time for a treadmill run or strength session."
            }
            
        # 3. WIND CHECK
        if wind > 30:
            return {
                "title": "Strong Winds",
                "description": "High wind resistance affecting pace and balance.",
                "recommendation": "indoor_cycling", # specific suggestion
                "risk_level": "medium",
                "action": "Avoid cycling outdoors. Running effort will be higher."
            }
            
        # 4. UV CHECK
        if uv >= 8:
            return {
                "title": "High UV Index",
                "description": "Sunburn risk is very high.",
                "recommendation": "outdoor_caution",
                "risk_level": "medium",
                "action": "Wear sunscreen and sunglasses. Seek shade."
            }

        # 5. COLD CHECK
        if temp < 12:
            return {
                "title": "Cold Weather",
                "description": "Muscles may take longer to warm up.",
                "recommendation": "outdoor",
                "risk_level": "low",
                "action": "Extend your warm-up. Wear layers."
            }

        # DEFAULT: IDEAL
        return {
            "title": "Ideal Conditions",
            "description": "Great weather for outdoor training.",
            "recommendation": "outdoor",
            "risk_level": "low",
            "action": "Go for that PR! Perfect time to run or ride."
        }
