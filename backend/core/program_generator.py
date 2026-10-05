"""
Program Generation API
根據用戶選擇的Hashtag目標生成四大專屬目標指標與任務清單
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel
import random

class HashtagGoal(BaseModel):
    score: int = 0
    hashtags: List[str] = []

class ProgramGenerationRequest(BaseModel):
    user_id: str
    selected_goals: Dict[str, Any] = {}  # More flexible type
    selected_tags: List[str]
    duration_weeks: int = 4

class TaskItem(BaseModel):
    id: str
    title: str
    description: str
    type: str  # 'exercise', 'habit', 'measure'
    impact_score: int
    frequency: str # 'daily', 'weekly', 'once'

class GoalIndex(BaseModel):
    id: str
    name: str  # e.g., "結構支撐分"
    en_name: str # e.g., "Structural Strength"
    score: int
    description: str
    components: List[Dict[str, Any]] # e.g., [{'name': '動作穩定性', 'percentage': 0.4}]
    tasks: List[TaskItem]
    explanation: str # "系統解釋"

class ProgramResponse(BaseModel):
    program_id: str
    user_id: str
    created_at: str
    goal_indexes: List[GoalIndex]
    rationalization_text: str # "總結給使用者的合理化說明"
    total_score: int
    editable: bool = True

def generate_personalized_program(request: ProgramGenerationRequest) -> ProgramResponse:
    """
    生成四大專屬目標與任務清單
    """
    selected_tags = request.selected_tags
    
    # 1. Define Goal Indexes logic
    indexes_config = {
        'structural': {
            'id': 'structural',
            'name': '結構支撐分',
            'en_name': 'Structural Strength',
            'target_tags': ['lower_back', 'knee_pain', 'glute_build', 'beginner'], # #下背痠痛, #膝蓋不適, #蜜桃臀, #運動新手
            'components': [
                {'name': '動作穩定性', 'percentage': 0.4, 'desc': '完成低衝擊的肌力訓練'},
                {'name': '核心參與度', 'percentage': 0.4, 'desc': '每日完成 5 分鐘核心基礎練習'},
                {'name': '進度累積', 'percentage': 0.2, 'desc': '每週重量或次數的微幅增長'}
            ],
            'explanation_template': "根據你選擇的 {tag}，我們首要目標是強化臀部與核心力量。當你的『結構支撐分』提升，代表你的肌肉能有效替脊椎分擔壓力，從根本解決痠痛，而不是只靠按摩。",
            'base_tasks': [
                {'title': '每日核心喚醒', 'desc': '完成5分鐘死蟲式或棒式訓練', 'type': 'exercise', 'impact': 5, 'freq': 'daily'},
                {'title': '臀部啟動', 'desc': '橋式 3組 x 15次', 'type': 'exercise', 'impact': 5, 'freq': 'daily'},
                {'title': '低衝擊肌力', 'desc': '深蹲(徒手) 3組 x 12次', 'type': 'exercise', 'impact': 8, 'freq': '3/week'}
            ]
        },
        'metabolic': {
            'id': 'metabolic',
            'name': '代謝引擎分',
            'en_name': 'Metabolic Drive',
            'target_tags': ['boost_metabolism', 'abs', 'look_good', 'outside_eating', 'fat_loss'], # #提升代謝, #馬甲線, #穿衣顯瘦, #外食族補救
            'components': [
                {'name': '燃脂效率', 'percentage': 0.5, 'desc': '達到目標心率的運動時數'},
                {'name': '非運動消耗', 'percentage': 0.3, 'desc': '每日步數或爬樓梯層數 (NEAT)'},
                {'name': '肌肉保留', 'percentage': 0.2, 'desc': '抗阻力訓練的頻率'}
            ],
            'explanation_template': "為了達成你的 {tag} 目標，『代謝引擎分』能追蹤你的身體燃燒效率。分數越高，代表你即便在休息時，身體燃脂的能力也在進化，讓腹部線條更明顯。",
            'base_tasks': [
                {'title': '燃脂區間有氧', 'desc': '維持心率130-150bpm 持續30分鐘', 'type': 'exercise', 'impact': 10, 'freq': '3/week'},
                {'title': 'NEAT 達標', 'desc': '每日步行 8000 步', 'type': 'habit', 'impact': 5, 'freq': 'daily'},
                {'title': '高蛋白早餐', 'desc': '早餐攝取至少20g蛋白質', 'type': 'habit', 'impact': 5, 'freq': 'daily'}
            ]
        },
        'alignment': {
            'id': 'alignment',
            'name': '姿態校正分',
            'en_name': 'Alignment & Posture',
            'target_tags': ['neck_shoulder', 'right_angle', 'core_weak', 'leg_shape', 'posture'], # #肩頸僵硬, #直角肩 #久坐族 #腿部線條
            'components': [
                {'name': '關節活動度', 'percentage': 0.5, 'desc': '完成每日推薦的動態伸展'},
                {'name': '姿勢覺知', 'percentage': 0.3, 'desc': '定時點擊「現在姿勢正確」的簽到'},
                {'name': '對稱平衡', 'percentage': 0.2, 'desc': '單側動作訓練的完成度'}
            ],
            'explanation_template': "針對 {tag}，這不只是練肌肉，而是要『校正』。你的『姿態校正分』反映了你關節的空間。分數達標時，你的視覺體態會顯得更挺拔，遠離烏龜頸與圓肩。",
            'base_tasks': [
                {'title': '晨間動態伸展', 'desc': '貓牛式 + 胸大肌伸展', 'type': 'exercise', 'impact': 8, 'freq': 'daily'},
                {'title': '體態簽到', 'desc': '記錄當下姿勢是否正確', 'type': 'habit', 'impact': 2, 'freq': '3/day'},
                {'title': '靠牆站立', 'desc': '飯後靠牆站立5分鐘', 'type': 'habit', 'impact': 5, 'freq': 'daily'}
            ]
        },
        'vitality': {
            'id': 'vitality',
            'name': '身心韌性分',
            'en_name': 'Vitality & Resilience',
            'target_tags': ['easy_tired', 'sleep_bad', 'stress', 'endurance'], # #容易疲累 #睡眠品質差 #抗壓舒壓
            'components': [
                {'name': '神經修復', 'percentage': 0.4, 'desc': '睡前呼吸法或冥想完成'},
                {'name': '中低強度活動', 'percentage': 0.4, 'desc': '如散步、瑜珈，避免過度訓練'},
                {'name': '體力恢復', 'percentage': 0.2, 'desc': '靜息心率的穩定度或睡眠時數'}
            ],
            'explanation_template': "你選擇了 {tag}，代表你需要的是『有氧基礎與修復』。這個分數代表你身體的電池容量。分數提升後，你會發現下午不再容易斷電，工作專注力會明顯變好。",
            'base_tasks': [
                {'title': '睡前冥想', 'desc': '4-7-8呼吸法放鬆神經', 'type': 'habit', 'impact': 8, 'freq': 'daily'},
                {'title': '低強度恢復', 'desc': '戶外散步20分鐘', 'type': 'exercise', 'impact': 5, 'freq': 'daily'},
                {'title': '睡眠追蹤', 'desc': '記錄昨晚睡眠時數', 'type': 'measure', 'impact': 5, 'freq': 'daily'}
            ]
        }
    }

    # 2. Calculate mappings and Generate Indexes
    generated_indexes = []
    total_tags_count = len(selected_tags)
    
    # Simple logic: If user selected a tag relevant to an index, that index gets a base score
    # and tasks are added. 
    
    for key, config in indexes_config.items():
        # Find intersection between selected tags and target tags for this index
        relevant_tags = [tag for tag in selected_tags if tag in config['target_tags']]
        
        # Calculate initial score (mock logic: base 60 + bonus per relevant tag)
        if len(relevant_tags) > 0:
            score = min(90, 60 + len(relevant_tags) * 10)
            
            # Use the first relevant tag to format the explanation template
            # Need to map tag ID to a Chinese name if possible, or just use a generic term if tag list is not comprehensive here
            # For simplicity, we'll try to use the raw tag or a default
            display_tag = f"#{relevant_tags[0]}" 
            
            # Map common tags to Chinese for better display
            tag_name_map = {
                'lower_back': '#下背痠痛', 'knee_pain': '#膝蓋不適', 'glute_build': '#蜜桃臀', 'beginner': '#運動新手',
                'boost_metabolism': '#提升代謝', 'abs': '#馬甲線', 'look_good': '#穿衣顯瘦', 'outside_eating': '#外食族補救', 'fat_loss': '#減脂',
                'neck_shoulder': '#肩頸僵硬', 'right_angle': '#直角肩', 'core_weak': '#久坐族', 'leg_shape': '#腿部線條', 'posture': '#改善體態',
                'easy_tired': '#容易疲累', 'sleep_bad': '#睡眠品質差', 'stress': '#抗壓舒壓'
            }
            if relevant_tags[0] in tag_name_map:
                display_tag = tag_name_map[relevant_tags[0]]

            explanation = config['explanation_template'].format(tag=display_tag)
            
            # Expand tasks: Add unique IDs
            tasks_with_ids = []
            for t in config['base_tasks']:
                new_task = t.copy()
                new_task['id'] = f"{key}_{random.randint(1000,9999)}"
                new_task['impact_score'] = t['impact'] # Ensure key matches model
                new_task['frequency'] = t['freq']
                # Create TaskItem object
                tasks_with_ids.append(TaskItem(
                    id=new_task['id'],
                    title=new_task['title'],
                    description=new_task['desc'],
                    type=new_task['type'],
                    impact_score=new_task['impact_score'],
                    frequency=new_task['frequency']
                ))

            generated_indexes.append(GoalIndex(
                id=config['id'],
                name=config['name'],
                en_name=config['en_name'],
                score=score,
                description=f"針對: {', '.join([tag_name_map.get(t, '#'+t) for t in relevant_tags])}",
                components=config['components'],
                tasks=tasks_with_ids,
                explanation=explanation
            ))
        else:
            # Even if no specific tags match, we might want to show the index with 0 score or hide it?
            # User wants a personalized plan based on "3 key needs" -> "2 core goals".
            # So typically we expect 2-3 tailored indexes.
            # But let's return it with 0 score if not relevant, or exclude it. 
            # Strategy: Exclude irrelevant indexes to focus on "Pain Point Blueprint".
            pass

    # Ensure we have at least some indexes (fallback if no tags matched rigorously)
    if not generated_indexes:
        # Fallback to Vitality as a safe default
        c = indexes_config['vitality']
        generated_indexes.append(GoalIndex(
            id=c['id'], name=c['name'], en_name=c['en_name'], score=60,
            description="基礎身心調理", components=c['components'], 
            tasks=[TaskItem(id="fallback_1", title="深呼吸", description="放鬆身心", type="habit", impact_score=5, frequency="daily")],
            explanation="即使沒有特定標籤，基礎的身心修復也是健康的關鍵。"
        ))

    total_score = sum(idx.score for idx in generated_indexes) // len(generated_indexes)

    rationalization = (
        f"我們分析了你的 {len(selected_tags)} 個關鍵需求，為你量身打造了 {len(generated_indexes)} 大核心目標指標。"
        f"這不是通用的健身計劃，而是專屬於你的『痛點解決藍圖』。"
        f"當總分達到 80 分，你所選的標籤困擾將獲得顯著改善。"
    )

    program_id = f"prog_{request.user_id}_{int(datetime.now().timestamp())}"
    
    return ProgramResponse(
        program_id=program_id,
        user_id=request.user_id,
        created_at=datetime.now().isoformat(),
        goal_indexes=generated_indexes,
        rationalization_text=rationalization,
        total_score=total_score,
        editable=True
    )
