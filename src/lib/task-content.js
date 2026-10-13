export const taskContent=task=>task.content??[task.title,task.notes].filter(Boolean).join('\n');
export function taskFields(content){
 const text=content.trim();
 if(!text)throw Error('请输入事项内容');
 const title=text.split('\n',1)[0].slice(0,200);
 return {content,title,notes:text.slice(title.length).replace(/^\n/,'')};
}
