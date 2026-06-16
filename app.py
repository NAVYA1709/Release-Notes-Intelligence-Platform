import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
import re
import time
from datetime import datetime
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Cache configuration
CACHE_DURATION = 300  # 5 minutes
_feed_cache = {
    'entries': None,
    'last_fetched': None,
    'error': None
}

def parse_feed_content(xml_data):
    """
    Parses the BigQuery release notes Atom feed and splits each entry's HTML content
    into individual sub-updates (e.g. Feature, Issue, Changed).
    """
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    
    for entry_elem in root.findall('atom:entry', ns):
        # Title (which is the release date in this feed, e.g., "June 15, 2026")
        title_elem = entry_elem.find('atom:title', ns)
        date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        # ID
        id_elem = entry_elem.find('atom:id', ns)
        entry_id = id_elem.text.strip() if id_elem is not None else ""
        
        # Updated timestamp
        updated_elem = entry_elem.find('atom:updated', ns)
        updated_str = updated_elem.text.strip() if updated_elem is not None else ""
        
        # Parse timestamp to a prettier format if possible
        formatted_date = date_str
        try:
            if updated_str:
                # Parse "2026-06-15T00:00:00-07:00" (ignoring tz for simplicity or using strip)
                # Google dates look like "2026-06-15T00:00:00-07:00"
                dt_part = updated_str.split('T')[0]
                dt = datetime.strptime(dt_part, "%Y-%m-%d")
                formatted_date = dt.strftime("%B %d, %Y")
        except Exception:
            pass
            
        # Alternate Link
        link_elem = entry_elem.find('atom:link[@rel="alternate"]', ns)
        if link_elem is None:
            link_elem = entry_elem.find('atom:link', ns)
        entry_link = link_elem.attrib.get('href', '').strip() if link_elem is not None else ""
        
        # Content HTML
        content_elem = entry_elem.find('atom:content', ns)
        content_html = content_elem.text.strip() if content_elem is not None else ""
        
        updates = []
        if content_html:
            soup = BeautifulSoup(content_html, 'html.parser')
            headers_h3 = soup.find_all('h3')
            
            if not headers_h3:
                # Fallback: whole content is a single update
                text_content = soup.get_text().strip()
                text_content = re.sub(r'\s+', ' ', text_content)
                updates.append({
                    'type': 'General',
                    'html_content': str(soup),
                    'text_content': text_content
                })
            else:
                # Parse any content before the first h3 as General/Notice
                first_h3 = headers_h3[0]
                prev_siblings = []
                sibling = first_h3.previous_sibling
                while sibling:
                    prev_siblings.insert(0, str(sibling))
                    sibling = sibling.previous_sibling
                
                prev_html = "".join(prev_siblings).strip()
                if prev_html:
                    prev_soup = BeautifulSoup(prev_html, 'html.parser')
                    prev_text = prev_soup.get_text().strip()
                    if prev_text:
                        updates.append({
                            'type': 'Notice',
                            'html_content': prev_html,
                            'text_content': re.sub(r'\s+', ' ', prev_text)
                        })
                
                # Split content by h3 tags
                for h3 in headers_h3:
                    update_type = h3.get_text(strip=True)
                    
                    sibling_html = []
                    sibling = h3.next_sibling
                    while sibling and sibling.name != 'h3':
                        sibling_html.append(str(sibling))
                        sibling = sibling.next_sibling
                    
                    html_content = "".join(sibling_html).strip()
                    sibling_soup = BeautifulSoup(html_content, 'html.parser')
                    text_content = sibling_soup.get_text().strip()
                    text_content = re.sub(r'\s+', ' ', text_content)
                    
                    # Clean up trailing/leading spaces in HTML
                    html_content = html_content.strip()
                    
                    updates.append({
                        'type': update_type,
                        'html_content': html_content,
                        'text_content': text_content
                    })
                    
        entries.append({
            'id': entry_id,
            'date': date_str,
            'formatted_date': formatted_date,
            'updated': updated_str,
            'link': entry_link,
            'updates': updates
        })
        
    return entries

def fetch_feed(force_refresh=False):
    """
    Fetches the Atom feed and updates the cache. Handles HTTP failures and rate-limiting gracefully.
    """
    global _feed_cache
    now = time.time()
    
    # Check cache validity
    if not force_refresh and _feed_cache['entries'] is not None:
        if _feed_cache['last_fetched'] and (now - _feed_cache['last_fetched']) < CACHE_DURATION:
            return _feed_cache['entries'], datetime.fromtimestamp(_feed_cache['last_fetched']).isoformat(), None

    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            raise Exception(f"HTTP error {response.status_code} from feed source.")
        
        parsed_entries = parse_feed_content(response.content)
        
        # Update cache
        _feed_cache['entries'] = parsed_entries
        _feed_cache['last_fetched'] = now
        _feed_cache['error'] = None
        
        return parsed_entries, datetime.fromtimestamp(now).isoformat(), None
    except Exception as e:
        error_msg = str(e)
        # If we have stale cache, return it with error info, otherwise return empty + error
        if _feed_cache['entries'] is not None:
            return _feed_cache['entries'], datetime.fromtimestamp(_feed_cache['last_fetched']).isoformat(), f"Warning: Failed to refresh. Using cached data. Details: {error_msg}"
        return [], None, f"Error fetching feed: {error_msg}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    entries, last_fetched, error = fetch_feed(force_refresh=force_refresh)
    
    return jsonify({
        'status': 'error' if error and not entries else 'success',
        'entries': entries,
        'last_fetched': last_fetched,
        'error': error
    })

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
