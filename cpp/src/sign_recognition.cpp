#include "sign_recognition.h"
#include <cmath>
#include <algorithm>
#include <cstring>

namespace SignRecognition {

SignRecognizer::SignRecognizer() 
    : detection_threshold_(0.5f)
    , recognition_threshold_(0.7f)
    , is_initialized_(false) {
}

SignRecognizer::~SignRecognizer() {
    cleanup();
}

bool SignRecognizer::initialize() {
    if (is_initialized_) {
        return true;
    }
    
    // 기본 제스처 템플릿 로드
    if (!load_gesture_templates()) {
        return false;
    }
    
    is_initialized_ = true;
    return true;
}

void SignRecognizer::cleanup() {
    gesture_templates_.clear();
    is_initialized_ = false;
}

bool SignRecognizer::load_gesture_templates() {
    gesture_templates_.clear();
    
    // 간단한 수화 제스처들 (정규화된 좌표계 기준)
    
    // "안녕하세요" - 손바닥 펼치고 흔들기
    GestureTemplate hello;
    hello.name = "안녕하세요";
    hello.id = 1;
    // 손바닥을 펼친 상태의 대략적인 랜드마크 (정규화된 좌표)
    hello.template_points = {{
        {0.5f, 0.3f},   // 손목 (0)
        {0.4f, 0.25f},  // 엄지 CMC (1)
        {0.35f, 0.2f},  // 엄지 MCP (2)
        {0.3f, 0.15f},  // 엄지 IP (3)
        {0.25f, 0.1f},  // 엄지 TIP (4)
        {0.45f, 0.1f},  // 검지 MCP (5)
        {0.4f, 0.05f},  // 검지 PIP (6)
        {0.35f, 0.02f}, // 검지 DIP (7)
        {0.3f, 0.0f},   // 검지 TIP (8)
        {0.55f, 0.1f},  // 중지 MCP (9)
        {0.5f, 0.05f},  // 중지 PIP (10)
        {0.45f, 0.02f}, // 중지 DIP (11)
        {0.4f, 0.0f},   // 중지 TIP (12)
        {0.65f, 0.1f},  // 약지 MCP (13)
        {0.6f, 0.05f},  // 약지 PIP (14)
        {0.55f, 0.02f}, // 약지 DIP (15)
        {0.5f, 0.0f},   // 약지 TIP (16)
        {0.75f, 0.15f}, // 새끼 MCP (17)
        {0.7f, 0.1f},   // 새끼 PIP (18)
        {0.65f, 0.07f}, // 새끼 DIP (19)
        {0.6f, 0.05f}   // 새끼 TIP (20)
    }};
    gesture_templates_.push_back(hello);
    
    // "감사합니다" - 주먹 쥐고 가슴에
    GestureTemplate thanks;
    thanks.name = "감사합니다";
    thanks.id = 2;
    // 주먹 쥔 상태의 랜드마크
    thanks.template_points = {{
        {0.5f, 0.4f},   // 손목 (0)
        {0.45f, 0.35f}, // 엄지 CMC (1)
        {0.4f, 0.3f},   // 엄지 MCP (2)
        {0.38f, 0.25f}, // 엄지 IP (3)
        {0.35f, 0.2f},  // 엄지 TIP (4)
        {0.55f, 0.3f},  // 검지 MCP (5)
        {0.58f, 0.25f}, // 검지 PIP (6)
        {0.6f, 0.23f},  // 검지 DIP (7)
        {0.62f, 0.2f},  // 검지 TIP (8)
        {0.6f, 0.3f},   // 중지 MCP (9)
        {0.63f, 0.25f}, // 중지 PIP (10)
        {0.65f, 0.23f}, // 중지 DIP (11)
        {0.67f, 0.2f},  // 중지 TIP (12)
        {0.65f, 0.32f}, // 약지 MCP (13)
        {0.67f, 0.28f}, // 약지 PIP (14)
        {0.69f, 0.25f}, // 약지 DIP (15)
        {0.7f, 0.22f},  // 약지 TIP (16)
        {0.7f, 0.35f},  // 새끼 MCP (17)
        {0.72f, 0.32f}, // 새끼 PIP (18)
        {0.73f, 0.29f}, // 새끼 DIP (19)
        {0.75f, 0.26f}  // 새끼 TIP (20)
    }};
    gesture_templates_.push_back(thanks);
    
    // "예" - 검지 세우기
    GestureTemplate yes;
    yes.name = "예";
    yes.id = 3;
    yes.template_points = {{
        {0.5f, 0.4f},   // 손목 (0)
        {0.4f, 0.35f},  // 엄지 CMC (1)
        {0.35f, 0.32f}, // 엄지 MCP (2)
        {0.32f, 0.28f}, // 엄지 IP (3)
        {0.3f, 0.25f},  // 엄지 TIP (4)
        {0.55f, 0.3f},  // 검지 MCP (5)
        {0.5f, 0.2f},   // 검지 PIP (6)
        {0.45f, 0.1f},  // 검지 DIP (7)
        {0.4f, 0.0f},   // 검지 TIP (8)
        {0.6f, 0.32f},  // 중지 MCP (9)
        {0.63f, 0.28f}, // 중지 PIP (10)
        {0.65f, 0.26f}, // 중지 DIP (11)
        {0.67f, 0.24f}, // 중지 TIP (12)
        {0.65f, 0.35f}, // 약지 MCP (13)
        {0.68f, 0.32f}, // 약지 PIP (14)
        {0.7f, 0.29f},  // 약지 DIP (15)
        {0.72f, 0.26f}, // 약지 TIP (16)
        {0.7f, 0.38f},  // 새끼 MCP (17)
        {0.73f, 0.35f}, // 새끼 PIP (18)
        {0.75f, 0.32f}, // 새끼 DIP (19)
        {0.77f, 0.29f}  // 새끼 TIP (20)
    }};
    gesture_templates_.push_back(yes);
    
    return true;
}

bool SignRecognizer::detectSkinRegion(const ImageData& image, std::vector<Point2D>& contour) {
    if (!image.data || image.channels < 3) {
        return false;
    }
    
    contour.clear();
    
    // 간단한 피부색 검출
    const int stride = image.channels;
    std::vector<std::vector<bool>> skin_mask(image.height, std::vector<bool>(image.width, false));
    
    for (int y = 0; y < image.height; ++y) {
        for (int x = 0; x < image.width; ++x) {
            int idx = (y * image.width + x) * stride;
            uint8_t r = image.data[idx];
            uint8_t g = image.data[idx + 1];
            uint8_t b = image.data[idx + 2];
            
            // YCrCb 색공간 기반 피부색 검출
            float Y = 0.299f * r + 0.587f * g + 0.114f * b;
            float Cr = 0.713f * (r - Y);
            float Cb = 0.564f * (b - Y);
            
            // 피부색 범위
            if (Y > 80 && Cr > -15 && Cr < 25 && Cb > -30 && Cb < 20) {
                skin_mask[y][x] = true;
            }
        }
    }
    
    // 가장 큰 연결 영역 찾기 (손 영역)
    int max_area = 0;
    int center_x = 0, center_y = 0;
    
    for (int y = 0; y < image.height; ++y) {
        for (int x = 0; x < image.width; ++x) {
            if (skin_mask[y][x]) {
                int area = 1;
                // 간단한 연결 영역 크기 계산
                for (int dy = -2; dy <= 2; ++dy) {
                    for (int dx = -2; dx <= 2; ++dx) {
                        int ny = y + dy, nx = x + dx;
                        if (ny >= 0 && ny < image.height && nx >= 0 && nx < image.width) {
                            if (skin_mask[ny][nx]) area++;
                        }
                    }
                }
                
                if (area > max_area) {
                    max_area = area;
                    center_x = x;
                    center_y = y;
                }
            }
        }
    }
    
    // 손 영역의 대략적인 윤곽선 생성
    if (max_area > 1000) {  // 최소 크기 체크
        // 손목부터 손가락 끝까지 8방향으로 윤곽선 점 생성
        for (int angle = 0; angle < 360; angle += 45) {
            float rad = angle * M_PI / 180.0f;
            float radius = 50.0f;  // 기본 반지름
            
            Point2D point;
            point.x = (center_x + radius * cos(rad)) / image.width;
            point.y = (center_y + radius * sin(rad)) / image.height;
            contour.push_back(point);
        }
        return true;
    }
    
    return false;
}

HandLandmark SignRecognizer::extractHandLandmarks(const ImageData& image, const std::vector<Point2D>& contour) {
    HandLandmark landmark;
    landmark.is_detected = false;
    landmark.confidence = 0.0f;
    
    if (contour.empty()) {
        return landmark;
    }
    
    // 손목 중심점 계산
    float center_x = 0, center_y = 0;
    for (const auto& point : contour) {
        center_x += point.x;
        center_y += point.y;
    }
    center_x /= contour.size();
    center_y /= contour.size();
    
    // 간소화된 손 랜드마크 생성
    landmark.points[0] = {center_x, center_y + 0.1f};  // 손목
    
    // 각 손가락별 랜드마크 (간단한 방사형 배치)
    const float finger_angles[] = {-60, -30, 0, 30, 60};  // 엄지부터 새끼까지
    const float finger_lengths[] = {0.08f, 0.12f, 0.13f, 0.11f, 0.09f};
    
    for (int finger = 0; finger < 5; ++finger) {
        float angle = finger_angles[finger] * M_PI / 180.0f;
        float length = finger_lengths[finger];
        
        for (int joint = 0; joint < 4; ++joint) {
            int landmark_idx = 1 + finger * 4 + joint;
            float joint_ratio = (joint + 1) / 4.0f;
            
            landmark.points[landmark_idx] = {
                center_x + static_cast<float>(length * joint_ratio * cos(angle - M_PI/2)),
                center_y - static_cast<float>(length * joint_ratio * sin(angle - M_PI/2))
            };
        }
    }
    
    landmark.is_detected = true;
    landmark.confidence = 0.8f;  // 고정된 신뢰도
    
    return landmark;
}

float SignRecognizer::calculateDistance(const std::array<Point2D, 21>& points1, 
                                      const std::array<Point2D, 21>& points2) {
    float total_distance = 0.0f;
    
    for (int i = 0; i < 21; ++i) {
        float dx = points1[i].x - points2[i].x;
        float dy = points1[i].y - points2[i].y;
        total_distance += sqrt(dx * dx + dy * dy);
    }
    
    return total_distance / 21.0f;  // 평균 거리
}

RecognitionResult SignRecognizer::matchGesture(const HandLandmark& hand) {
    RecognitionResult result;
    result.is_valid = false;
    result.confidence = 0.0f;
    result.gesture_name = "알 수 없음";
    result.gesture_id = -1;
    
    if (!hand.is_detected) {
        return result;
    }
    
    float best_distance = std::numeric_limits<float>::max();
    int best_gesture_idx = -1;
    
    // 모든 제스처 템플릿과 비교
    for (size_t i = 0; i < gesture_templates_.size(); ++i) {
        float distance = calculateDistance(hand.points, gesture_templates_[i].template_points);
        
        if (distance < best_distance) {
            best_distance = distance;
            best_gesture_idx = i;
        }
    }
    
    // 임계값 체크
    if (best_gesture_idx >= 0 && best_distance < 0.3f) {  // 거리 임계값
        result.is_valid = true;
        result.gesture_name = gesture_templates_[best_gesture_idx].name;
        result.gesture_id = gesture_templates_[best_gesture_idx].id;
        result.confidence = 1.0f - (best_distance / 0.3f);  // 정규화된 신뢰도
        result.hands.push_back(hand);
    }
    
    return result;
}

RecognitionResult SignRecognizer::process_frame(const ImageData& image) {
    RecognitionResult result;
    result.is_valid = false;
    result.confidence = 0.0f;
    result.gesture_name = "감지되지 않음";
    result.gesture_id = 0;
    
    if (!is_initialized_ || !image.data) {
        return result;
    }
    
    // 1. 피부색 영역 검출
    std::vector<Point2D> contour;
    if (!detectSkinRegion(image, contour)) {
        return result;
    }
    
    // 2. 손 랜드마크 추출
    HandLandmark hand = extractHandLandmarks(image, contour);
    if (!hand.is_detected || hand.confidence < detection_threshold_) {
        return result;
    }
    
    // 3. 제스처 매칭
    result = matchGesture(hand);
    
    return result;
}

void SignRecognizer::add_custom_gesture(const std::string& name, int id, 
                                       const std::array<Point2D, 21>& points) {
    GestureTemplate custom_gesture;
    custom_gesture.name = name;
    custom_gesture.id = id;
    custom_gesture.template_points = points;
    
    gesture_templates_.push_back(custom_gesture);
}

} // namespace SignRecognition