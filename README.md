# Tab EasyMotion

一个面向当前编辑器组的标签页快速跳转 VS Code 扩展，借鉴 EasyMotion 的按键提示方式，帮助你在拥有大量拆分编辑器和标签页时迅速切换焦点。

## 功能亮点

- 🔤 为当前活动编辑器组的所有标签生成唯一的键位提示，支持多字符组合。
- 🎯 自定义 Webview 面板实时渲染标签列表，高亮提示字符并显示文件路径等描述信息。
- 🧭 Webview 面板支持自适应多列布局，自动提示下一个应输入的字符，并在多字符场景下逐字高亮。
- ⚡ 键盘输入实时筛选匹配项，输入完整提示后立即切换到目标标签。
- 🛠️ 支持自定义提示字符集合与最大提示长度，适配不同键盘习惯。

## 使用方法

1. 在编辑器中激活命令 `Tab EasyMotion: Jump Between Tabs`（默认快捷键 `Ctrl+Shift+;` / `Cmd+Shift+;`）。
2. 面板会显示当前编辑器组中的标签页及其提示键。
3. 按提示键的字符进行筛选：
   - 输入过程中，候选标签会根据前缀高亮；
   - 按 `Backspace` 可以撤销上一步输入；
   - 按 `Enter` 时会跳转到当前匹配列表的第一个标签；
   - 按 `Esc` 可取消操作并关闭面板。

> ⚠️ 由于 VS Code API 限制，目前无法直接重新聚焦部分 Webview 类型的标签页，遇到此类标签会弹出提示。

## 可配置项

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `tabEasyMotion.hintAlphabet` | `asdfghjkl;wertyuiopxcvbnm` | 生成提示键时使用的字符集合，会依次生成单字符、双字符组合。 |
| `tabEasyMotion.maxHintLength` | `2` | 提示键的最大长度。设置为 `0` 或负数表示不限制长度。 |

在 `settings.json` 中示例：

```json
{
  "tabEasyMotion.hintAlphabet": "asdfjklgh",
  "tabEasyMotion.maxHintLength": 3
}
```

## 开发说明

1. 安装依赖：`npm install`
2. 编译 TypeScript：`npm run compile`
3. 使用 VS Code `调试: 运行扩展` 启动调试实例进行验证。

## 测试建议

- 在单编辑器组和多分屏环境中验证提示覆盖情况。
- 尝试包含未命名文件、Git diff、Notebook、终端等类型的标签页，确认交互提示是否合理。
- 修改 `hintAlphabet` 与 `maxHintLength` 并重新加载扩展，检查提示生成是否符合预期。

