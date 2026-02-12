import os
import csv
import glob

# --- 配置区 ---
INPUT_FOLDER = './data'           # 你的 CSV 文件所在的文件夹
OUTPUT_FILE = 'All_Verbs_Training.csv'   # 输出文件名
# 判断是否为动词的关键词 (只要 type 包含这些字符)
VERB_TAGS = ['v', 'vt', 'vi', 'vr'] 

def is_verb(type_str):
    """
    判断词性是否为动词。
    逻辑：包含 'v' 且不包含 'adv' (副词)。
    """
    if not type_str:
        return False
    t = type_str.lower().strip()
    return 'v' in t and 'adv' not in t

def main():
    all_verbs = []
    seen_words = set() # 用于去重

    # 1. 扫描所有 CSV 文件
    csv_files = glob.glob(os.path.join(INPUT_FOLDER, '**/*.csv'), recursive=True)
    print(f"🔍 发现 {len(csv_files)} 个 CSV 文件，准备开始提取动词...")

    # 定义我们想要的输出列顺序 (为了适配你的 APP，最好加上 id)
    # 根据你提供的样本：type, gender, word, cn, forms, example
    fieldnames = ['id', 'type', 'gender', 'word', 'cn', 'forms', 'example', 'source_file']

    verb_count = 0

    for file_path in csv_files:
        # 跳过输出文件本身，防止死循环
        if file_path.endswith(OUTPUT_FILE):
            continue

        filename = os.path.basename(file_path)

        try:
            # utf-8-sig 可以自动处理 Excel 导出的 BOM 头
            with open(file_path, 'r', encoding='utf-8-sig', errors='ignore') as f:
                # 使用 DictReader，根据表头名字读取，不依赖列的位置
                reader = csv.DictReader(f)
                
                # 预处理表头：去除可能存在的空格 (例如 " type" -> "type")
                # 如果 DictReader 读到的 fieldnames 有空格，下面的 row['type'] 可能会报错
                # 这里做一个简单的容错处理：
                if reader.fieldnames:
                    clean_fieldnames = [fn.strip() for fn in reader.fieldnames]
                    reader.fieldnames = clean_fieldnames

                for row in reader:
                    # 获取关键字段，如果没有该列则默认为空字符串
                    w_type = row.get('type', '').strip()
                    word = row.get('word', '').strip()
                    cn = row.get('cn', '').strip()
                    
                    # 1. 必须有单词和词性
                    if not word or not w_type:
                        continue

                    # 2. 判断是否是动词
                    if is_verb(w_type):
                        # 3. 去重
                        if word not in seen_words:
                            seen_words.add(word)
                            verb_count += 1

                            # 4. 构建新的一行数据
                            new_row = {
                                'id': verb_count, # 自动生成 ID，方便 App 记录错题
                                'type': w_type,
                                'gender': row.get('gender', ''), # 动词通常没性，但保留格式
                                'word': word,
                                'cn': cn,
                                'forms': row.get('forms', ''),
                                'example': row.get('example', ''),
                                'source_file': filename # 标记来源，方便你查阅
                            }
                            all_verbs.append(new_row)

        except Exception as e:
            print(f"⚠️  读取文件出错 {filename}: {e}")

    # 2. 写入汇总 CSV
    if all_verbs:
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_verbs)
        
        print(f"\n✅ 成功！已提取 {len(all_verbs)} 个动词。")
        print(f"📂 文件已保存为: {OUTPUT_FILE}")
        print("💡 提示：你可以用 Excel 打开它，修改 'word' 列添加搭配 (如: machen <A>)")
    else:
        print("\n❌ 未找到任何动词，请检查 CSV 文件的 'type' 列是否包含 'v'。")

if __name__ == "__main__":
    main()